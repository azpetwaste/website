// Fifty website sign ups, end to end, against a real Postgres: checkout, Stripe webhook, the CRM list, route planning and the crew app.
// Same harness as desk.test.mjs, plus a stand in for Stripe and map pins for ten real West Valley addresses.
// stand in for PostgREST (filters, embeds, upserts), and fakes Supabase Auth, Storage and the Census geocoder.
//
// Needs: a local Postgres and the `pg` package. Example:
//   DATABASE_URL=postgres://postgres@localhost:5433/apw_test NODE_PATH=/path/to/node_modules node build/desk.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fakeStripe, unitOf } from './stripe.fake.mjs';
import { loadPrices } from './prices.mjs';
const MONTH = loadPrices().month; // dollars a month for 1 to 6 dogs (src/prices.json)
const cents = (plan, dogs) => MONTH[plan][dogs - 1] * 100;
const priceOf = (plan, dogs) => 'price_' + plan + '_' + dogs + '_' + cents(plan, dogs);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pg;
try { pg = require('pg'); } catch (e) { console.log('skip: install the pg package (or set NODE_PATH) to run this test'); process.exit(0); }
const url = process.env.DATABASE_URL;
if (!url) { console.log('skip: set DATABASE_URL to an empty test database'); process.exit(0); }

pg.types.setTypeParser(1082, (v) => v); // dates as YYYY-MM-DD, like PostgREST
pg.types.setTypeParser(1182, (v) => (v === '{}' ? [] : v.slice(1, -1).split(','))); // date lists too
pg.types.setTypeParser(20, (v) => Number(v)); // bigint ids as numbers, like PostgREST
pg.types.setTypeParser(1184, (v) => { let t = v.replace(' ', 'T'); if (/[+-]\d\d$/.test(t)) t += ':00'; return t; }); // timestamps like PostgREST: 2026-11-09T19:08:46.01592+00:00
const db = new pg.Client({ connectionString: url });
await db.connect();
await db.query("set timezone = 'UTC'");
await db.query('drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;');
await db.query(`create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
await db.query(fs.readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8'));
await db.query(fs.readFileSync(path.join(ROOT, 'supabase/crm.sql'), 'utf8'));
await db.query(fs.readFileSync(path.join(ROOT, 'supabase/crm.sql'), 'utf8')); // safe to run twice

/* ---------- a small PostgREST stand in ---------- */
const cols = {};
for (const r of (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'`)).rows) (cols[r.table_name] ||= new Set()).add(r.column_name);
const FK = { customers: 'customer_id', routes: 'route_id', staff: 'staff_id', stops: 'stop_id' };
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('bad identifier ' + s); return '"' + s + '"'; };
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
function selectSql(table, sel, alias) {
  const parts = splitTop(sel || '*').map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => {
    const m = /^(?:([a-z_]+):)?([a-z_]+)\((.*)\)$/s.exec(p);
    if (m) {
      const name = m[1] || m[2], t = m[2], sub = 'e_' + t + '_' + Math.random().toString(36).slice(2, 7);
      const fk = FK[t];
      if (!cols[table].has(fk)) throw new Error('no relation ' + table + ' -> ' + t);
      return `(select row_to_json(x) from (select ${selectSql(t, m[3], sub)} from ${ident(t)} ${sub} where ${sub}.id = ${alias}.${ident(fk)}) x) as ${ident(name)}`;
    }
    if (p === '*') return alias + '.*';
    if (!cols[table].has(p)) throw new Error('no column ' + table + '.' + p);
    return alias + '.' + ident(p);
  }).join(', ');
}
function cond(col, expr, vals, alias) {
  const i = expr.indexOf('.');
  const op = expr.slice(0, i), v = decodeURIComponent(expr.slice(i + 1));
  const c = alias + '.' + ident(col);
  const add = (x) => { vals.push(x); return '$' + vals.length; };
  if (op === 'eq') return `${c} = ${add(v)}`;
  if (op === 'neq') return `${c} <> ${add(v)}`;
  if (op === 'lt') return `${c} < ${add(v)}`;
  if (op === 'lte') return `${c} <= ${add(v)}`;
  if (op === 'gt') return `${c} > ${add(v)}`;
  if (op === 'gte') return `${c} >= ${add(v)}`;
  if (op === 'ilike') return `${c}::text ilike ${add(v.replace(/\*/g, '%'))}`;
  if (op === 'is') return `${c} is ${({ null: 'null', true: 'true', false: 'false' })[v]}`;
  if (op === 'not' && v === 'is.null') return `${c} is not null`;
  if (op === 'cs') return `${c} @> ${add(v)}`;
  if (op === 'in') return `${c}::text = any(${add(v.replace(/^\(|\)$/g, '').split(','))})`;
  throw new Error('op ' + op);
}
function whereSql(table, params, vals, alias) {
  const w = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    if (k === 'or') {
      const inner = decodeURIComponent(v).replace(/^\(|\)$/g, '');
      w.push('(' + splitTop(inner).map((p) => { const i = p.indexOf('.'); return cond(p.slice(0, i), p.slice(i + 1), vals, alias); }).join(' or ') + ')');
    } else w.push(cond(k, v, vals, alias));
  }
  return w.length ? ' where ' + w.join(' and ') : '';
}
function orderSql(o, alias) {
  if (!o) return '';
  return ' order by ' + o.split(',').map((p) => { const [c, ...mods] = p.split('.'); return alias + '.' + ident(c) + (mods.includes('desc') ? ' desc' : ' asc') + (mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''); }).join(', ');
}
async function rest(method, rel, body, prefer) {
  const [table, qs] = rel.split('?');
  // Like PostgREST, a raw + in the query string means a space, so an unencoded timestamp fails here too.
  const params = [...new URLSearchParams(qs || '')].map(([k, v]) => [k, encodeURIComponent(v)]);
  const get = (k) => { const p = params.find((x) => x[0] === k); return p ? decodeURIComponent(p[1]) : null; };
  if (!cols[table]) throw new Error('no table ' + table);
  const vals = [];
  const ret = /return=representation/.test(prefer || '');
  if (method === 'GET') {
    const sql = `select ${selectSql(table, get('select'), 't0')} from ${ident(table)} t0${whereSql(table, params, vals, 't0')}${orderSql(get('order'), 't0')}${get('limit') ? ' limit ' + parseInt(get('limit'), 10) : ''}${get('offset') ? ' offset ' + parseInt(get('offset'), 10) : ''}`;
    return (await db.query(sql, vals)).rows;
  }
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const valuesSql = rows.map((r) => '(' + keys.map((k) => { vals.push(r[k] === undefined ? null : (Array.isArray(r[k]) ? r[k] : r[k])); return '$' + vals.length; }).join(',') + ')').join(',');
    let sql = `insert into ${ident(table)} (${keys.map(ident).join(',')}) values ${valuesSql}`;
    const oc = get('on_conflict');
    if (oc) {
      if (/ignore-duplicates/.test(prefer || '')) sql += ` on conflict (${oc.split(',').map(ident).join(',')}) do nothing`;
      else if (/merge-duplicates/.test(prefer || '')) sql += ` on conflict (${oc.split(',').map(ident).join(',')}) do update set ${keys.map((k) => ident(k) + ' = excluded.' + ident(k)).join(', ')}`;
    }
    const r = await db.query(sql + (ret ? ' returning *' : ''), vals);
    return ret ? r.rows : null;
  }
  if (method === 'PATCH') {
    const keys = Object.keys(body);
    const sets = keys.map((k) => { vals.push(body[k]); return ident(k) + ' = $' + vals.length; }).join(', ');
    const r = await db.query(`update ${ident(table)} t0 set ${sets}${whereSql(table, params, vals, 't0')}${ret ? ' returning t0.*' : ''}`, vals);
    return ret ? r.rows : null;
  }
  if (method === 'DELETE') { await db.query(`delete from ${ident(table)} t0${whereSql(table, params, vals, 't0')}`, vals); return null; }
}

/* ---------- fake Supabase Auth, Storage, Census, Resend ---------- */
const SB = 'https://demo.supabase.co';
const users = {}; // token -> user
const codes = {}; // email -> code
const files = {};
let otpSent = [];
let routesCalls = 0;
async function authUser(email) {
  const r = await db.query('select id from auth.users where email = $1', [email]);
  if (r.rows[0]) return r.rows[0].id;
  return (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
}
const reply = (data, status = 200) => new Response(data == null ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  const m = init.method || 'GET';
  try {
    if (u.startsWith(SB + '/rest/v1/')) {
      const data = await rest(m, u.slice((SB + '/rest/v1/').length), init.body ? JSON.parse(init.body) : null, init.headers && init.headers.prefer);
      return reply(data, m === 'POST' ? 201 : 200);
    }
  } catch (e) { console.log('  REST ERROR', m, u.slice(SB.length), String(e.message).slice(0, 200)); return reply({ message: e.message }, 400); }
  if (u === SB + '/auth/v1/admin/users' && m === 'POST') {
    const b = JSON.parse(init.body);
    if ((await db.query('select id from auth.users where email = $1', [b.email])).rows[0]) return reply({ msg: 'A user with this email address has already been registered' }, 422);
    return reply({ id: await authUser(b.email), email: b.email });
  }
  if (u === SB + '/auth/v1/otp') { const b = JSON.parse(init.body); otpSent.push(b.email); codes[b.email] = '123456'; await authUser(b.email); return reply({}); }
  if (u === SB + '/auth/v1/verify') {
    const b = JSON.parse(init.body);
    if (codes[b.email] !== b.token) return reply({ msg: 'bad code' }, 400);
    const id = await authUser(b.email); const t = 'tok_' + crypto.randomBytes(6).toString('hex');
    users[t] = { id, email: b.email };
    return reply({ access_token: t, refresh_token: 'r_' + t, expires_in: 3600, user: { id, email: b.email } });
  }
  if (u === SB + '/auth/v1/user') { const t = String((init.headers || {}).authorization || '').slice(7); return users[t] ? reply(users[t]) : reply({ msg: 'bad' }, 401); }
  if (u.startsWith(SB + '/storage/v1/object/sign/')) return reply({ signedURL: '/object/sign/' + u.split('/object/sign/')[1] + '?token=x' });
  if (u.startsWith(SB + '/storage/v1/object/')) { files[u.split('/object/')[1]] = init.body.length; return reply({ Key: 'ok' }); }
  if (u === 'https://routes.googleapis.com/directions/v2:computeRoutes') { routesCalls++; return reply({ routes: [{ duration: '420s', distanceMeters: 2500, polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }); }
  if (u.startsWith('https://geocoding.geo.census.gov/')) return reply({ result: { addressMatches: [{ coordinates: { x: -112.5501, y: 33.4801 } }] } });
  if (u.startsWith('https://api.resend.com/')) return reply({ id: 'm1' });
  return reply({ error: 'unmocked ' + u }, 500);
};

/* ---------- run the Worker ---------- */
const worker = (await import(path.join(ROOT, 'src/worker/worker.js'))).default;
const env = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', SITE_URL: 'https://arizonapetwaste.com', ASSETS: { fetch: async () => new Response('static') } };
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
let pass = 0, failN = 0;
const ok = (label, cond, extra) => { if (cond) pass++; else failN++; console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 220) : '')); };
async function call(p, method = 'GET', body, token, headers) {
  const r = await worker.fetch(new Request('https://arizonapetwaste.com' + p, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}, headers || {})
  }), env, ctx);
  let d = null; try { d = await r.json(); } catch (e) { }
  return { status: r.status, d };
}
const today = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
const wd = new Date(today + 'T19:00:00Z').getUTCDay();

/* ---------- fifty sign ups ---------- */
let seed = 20261109;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const BOX = [['85326', 15, 33.36, 33.44, -112.62, -112.50], ['85396', 8, 33.47, 33.52, -112.54, -112.47], ['85338', 10, 33.40, 33.46, -112.42, -112.34],
  ['85395', 7, 33.46, 33.50, -112.42, -112.36], ['85340', 5, 33.48, 33.52, -112.38, -112.33], ['85355', 5, 33.54, 33.60, -112.48, -112.40]];
const STREETS = ['W Sage Dr', 'N Palo Verde Ln', 'W Desert Bloom St', 'S Quail Run', 'W Mesquite Way', 'N Saguaro Trl', 'W Sunrise Ct', 'S Coyote Pl', 'W Ironwood Dr', 'N Agave Ave'];
const FIRST = ['Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gia', 'Hank', 'Ivy', 'Jon'], LAST = ['Reed', 'Cruz', 'Diaz', 'Ortiz', 'Stone'];
const N = Number(process.env.COUNT) || 50, GROUP = N > 100 ? 25 : 10;
const HOMES = [];
for (const [zip, n0, la0, la1, lo0, lo1] of BOX) for (let i = 0; i < n0 * N / 50; i++) {
  const k = HOMES.length;
  HOMES.push([FIRST[k % 10] + ' ' + LAST[Math.floor(k / 10) % 5] + (k >= 50 ? ' ' + Math.floor(k / 50) : ''), (1000 + k * 37) + ' ' + STREETS[Math.floor(rnd() * 10)], zip, ['week', 'week', 'week', 'eow', 'twice'][k % 5], 1 + (k % 4),
    +(la0 + rnd() * (la1 - la0)).toFixed(5), +(lo0 + rnd() * (lo1 - lo0)).toFixed(5)]);
}
// These sign ups are free month sign ups. The free month is the sale and has an end date, so it is pinned on here.
Object.assign(env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test', FREE_MONTH_UNTIL: '2099-01-01T06:59:59Z' });
const mails = [], charges = [], subPosts = [], payCalls = [];
let invoiceList = [], invN = 0, lastItem = null;
const madeBills = [];
const pay = fakeStripe(reply);
const sessions = pay.sessions, metaOverride = pay.metaOverride, subItems = pay.subItems, prepaidSubs = pay.prepaid, metaOf = pay.metaOf;
const deskFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  const m = init.method || 'GET';
  if (u.startsWith('https://geocoding.geo.census.gov/')) {
    const q = decodeURIComponent(u.split('address=')[1] || '');
    const h = HOMES.find((x) => q.startsWith(x[1] + ','));
    return reply({ result: { addressMatches: h ? [{ coordinates: { x: h[6], y: h[5] } }] : [] } });
  }
  if (u.startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return reply({ id: 'm' }); }
  if (u.startsWith('https://api.stripe.com/v1/')) {
    const p = u.slice('https://api.stripe.com/v1/'.length).split('?')[0], query = u.split('?')[1] || '';
    const f = new URLSearchParams(String(init.body || ''));
    const hit = p.startsWith('subscriptions/') && m === 'POST' ? null : pay.handle(m, p, query, f, (init.headers || {})['idempotency-key']);
    if (hit) return hit;
    if (p === 'subscription_items' && m === 'POST') { (subItems[f.get('subscription')] ||= []).push({ id: 'si_x', price: { id: f.get('price') }, quantity: Number(f.get('quantity')) }); itemCalls.push('add ' + f.get('quantity') + ' ' + f.get('proration_behavior')); return reply({ id: 'si_x' }); }
    if (p.startsWith('subscription_items/')) {
      // A price line is moved to another price (a new dog count), or taken off. si_7_0 is the first line of sub_7.
      const lid = p.slice(19), sub = 'sub_' + lid.split('_')[1];
      itemCalls.push((m === 'DELETE' ? 'remove' : 'set ' + (f.get('price') || 'no price') + ' ' + f.get('quantity')) + ' ' + f.get('proration_behavior'));
      if (m !== 'DELETE' && f.get('price')) subItems[sub] = [{ id: lid, price: { id: f.get('price'), unit_amount: unitOf(f.get('price')) }, quantity: 1 }];
      return reply({ id: lid });
    }
    if (p.startsWith('subscriptions/') && m === 'POST') { subPosts.push(p.slice(14) + ' ' + String(init.body)); return reply({ id: p.slice(14), status: 'active' }); }
    if (p === 'invoices' && m === 'GET') return reply({ data: invoiceList.concat(madeBills.filter((b) => b.customer === new URLSearchParams(query).get('customer'))) });
    if (/^invoices\/in_open\d*\/pay$/.test(p)) { payCalls.push(p + ' ' + ((init.headers || {})['idempotency-key'] || '')); return reply({ id: 'in', status: 'paid' }); }
    if (m === 'POST' && pay.bills[p.slice(9)] && /^invoices\/in_open\d*$/.test(p)) {
      const b = pay.bills[p.slice(9)];
      b.metadata = Object.assign({}, b.metadata, Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])));
      return reply(b);
    }
    if (p === 'invoiceitems' && m === 'GET') return reply({ data: [] });
    if (p === 'invoiceitems') { lastItem = { amount: Number(f.get('amount')), description: f.get('description') }; if (lastItem.amount > 0) charges.push(lastItem); return reply({ id: 'ii_1' }); }
    if (p === 'invoices') { const b = { id: 'in_' + (++invN), status: 'draft', customer: f.get('customer'), metadata: Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])) }; madeBills.push(b); return reply(b); }
    if (/^invoices\/in_\d+\/(finalize|pay)$/.test(p)) return reply({ id: 'in', status: 'paid' });
    return reply({ error: { message: 'unmocked stripe ' + p } }, 500);
  }
  return deskFetch(u, init);
};
const itemCalls = [];
// A plan has one price line: the price for its plan and its dog count.
function subObj(i, extra) { const h = HOMES[i], sub = 'sub_' + ids[i].n; const items = [{ price: { id: priceOf(h[3], h[4]), unit_amount: cents(h[3], h[4]) }, quantity: 1 }];
  return Object.assign({ id: sub, customer: 'cus_' + ids[i].n, status: 'active', metadata: metaOf(sub), items: { data: items } }, extra || {}); }
const monthOf = (i) => cents(HOMES[i][3], HOMES[i][4]);
async function customerToken(email) { codes[email] = '123456'; const r = await fetch(SB + '/auth/v1/verify', { method: 'POST', body: JSON.stringify({ email, token: '123456' }) }); return (await r.json()); }
async function hook(evt, opts) {
  const payload = JSON.stringify(evt), t = Math.floor(Date.now() / 1000) - ((opts && opts.old) || 0);
  const sig = crypto.createHmac('sha256', (opts && opts.secret) || env.STRIPE_WEBHOOK_SECRET).update(t + '.' + payload).digest('hex');
  const r = await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=' + t + ',v1=' + sig } }), env, ctx);
  return r.status;
}
const count = async (sql) => (await db.query(sql)).rows[0].n;

console.log('\nOffice setup');
codes['info@arizonapetwaste.com'] = '123456';
let r = await call('/api/staff/verify', 'POST', { email: 'info@arizonapetwaste.com', code: '123456' });
ok('owner signs in to the office', r.status === 200);
const owner = r.d.session.access_token;
r = await call('/api/office/team', 'POST', { name: 'Maria Lopez', email: 'maria@example.com', phone: '623-555-0101', role: 'scooper' }, owner);
ok('scooper added', r.status === 200);
const AREA_DAY = { buckeye: wd, goodyear: (wd + 1) % 7, litchfield: (wd + 2) % 7, citrus: (wd + 2) % 7 };
for (const a of Object.keys(AREA_DAY)) r = await call('/api/office/area', 'POST', { area: a, day: AREA_DAY[a] }, owner);
ok('each area has its own service day', r.status === 200, AREA_DAY);

console.log('\n' + N + ' people sign up, ' + GROUP + ' at a time');
const ids = [];
const t0 = Date.now();
for (let b = 0; b < N / GROUP; b++) {
  const res = await Promise.all(HOMES.slice(b * GROUP, b * GROUP + GROUP).map(async (h, j) => {
    const i = b * GROUP + j;
    const s = await customerToken('test' + (i + 1) + '@example.com');
    const body = { zip: h[2], plan: h[3], dogs: h[4], name: h[0], phone: '623555' + String(1000 + i), address: h[1], textsVisit: true, textsDeals: i % 2 === 0, page: '/book/' };
    const [a, twin] = await Promise.all([call('/api/checkout', 'POST', body, s.access_token), i % 10 === 0 ? call('/api/checkout', 'POST', body, s.access_token) : null]);
    const sub = a.d && a.d.clientSecret ? a.d.clientSecret.slice(3) : null;
    ids[i] = { uid: s.user.id, token: s.access_token, n: sub ? sub.slice(4) : null };
    const st = sub ? await hook(pay.sessionEvt(sub, s.user.id)) : 0;
    return a.status === 200 && st === 200 && (!twin || twin.status === 200);
  }));
  ok('sign ups ' + (b * GROUP + 1) + ' to ' + (b * GROUP + GROUP), res.every(Boolean), res.filter(Boolean).length + ' of ' + GROUP);
}
await Promise.all(waits.splice(0));
console.log('  ' + N + ' sign ups took ' + ((Date.now() - t0) / 1000).toFixed(1) + ' seconds');

console.log('\nThey show up in the CRM');
r = await call('/api/office/customers', 'GET', null, owner);
let list = r.d.customers || [];
ok(N + ' customers in the office list', list.length === N, list.length);
ok('all ' + N + ' are on their free month', list.every((c) => c.status === 'trialing'));
ok('all ' + N + ' have a map pin', list.every((c) => c.lat != null && c.lng != null));
// A sign up takes a day only while that day has room. Past the limit it waits for the office (Schedule tab, "New sign ups with no day yet").
{
  const LIMIT = 30, per = {};
  for (const c of list) for (const d of [c.service_day, c.service_day2]) if (d != null) { const k = d + '|' + (c.scooper_id || ''); per[k] = per[k] || [0, 0]; if (c.plan === 'eow') per[k][c.eow_week || 0]++; else { per[k][0]++; per[k][1]++; } }
  const most = Math.max(0, ...Object.values(per).map((x) => Math.max(x[0], x[1]))), waiting = list.filter((c) => c.service_day == null).length;
  // 50 sign ups land in the same instant here. Each one looks again after saving and steps back if the day went over.
  ok('no day is over ' + LIMIT + ' yards after sign up, even with 50 at the same instant (most ' + most + ')', most <= LIMIT, most);
  ok(N > LIMIT * 4 ? 'sign ups past the limit wait for the office instead of overloading a day (' + waiting + ' waiting)' : 'every sign up has a day or waits for the office (' + waiting + ' waiting)', N > LIMIT * 4 ? waiting > 0 : waiting <= N, waiting);
}
ok('office got ' + N + ' booking emails', mails.filter((x) => /^New booking/.test(x.subject)).length === N);
ok('every sign up saved its text consent records', (await count('select count(distinct user_id)::int n from consent_log')) === N);
ok('double tap on Pay made no double customers', (await count('select count(*)::int n from customers')) === N);
const bookedMails = mails.filter((x) => /^You are booked/.test(x.subject)).length, plansMade = Object.keys(pay.made).length;
for (let i = 0; i < N; i++) await hook(pay.sessionEvt('sub_' + ids[i].n, ids[i].uid));
// The sign up page reports in too, and Stripe sends its own "plan created" event: neither may double anything.
for (let i = 0; i < 5; i++) { await call('/api/checkout/done', 'POST', { session: 'cs_sub_' + ids[i].n }, ids[i].token); await hook({ type: 'customer.subscription.created', data: { object: subObj(i, { status: 'trialing' }) } }); }
await Promise.all(waits.splice(0));
ok('Stripe sending every webhook twice changes nothing', (await count('select count(*)::int n from customers')) === N && (await count("select count(*)::int n from customers where status = 'trialing'")) === N);
ok('every new plan had its first bill looked at in Stripe once', pay.previews.length === N && new Set(pay.previews).size === N, pay.previews.length);
ok('Stripe’s first bill, worked out line by line, is the one full month every customer was told', mails.filter((x) => /^CHECK BILLING/.test(x.subject)).length === 0
  && ids.every((x) => pay.firstBill('sub_' + x.n) === Number(pay.made['sub_' + x.n].get('metadata[first_charge]')) && pay.firstBill('sub_' + x.n) === pay.fullMonth('sub_' + x.n)), mails.filter((x) => /^CHECK BILLING/.test(x.subject)).map((x) => x.text).slice(0, 2));
ok('one plan and one welcome email for each sign up, however many times it is reported', Object.keys(pay.made).length === N && plansMade === N && bookedMails === N && mails.filter((x) => /^You are booked/.test(x.subject)).length === N, [plansMade, bookedMails]);
{ const f = pay.made['sub_' + ids[3].n], h = HOMES[3];
  ok('the server starts each plan with our prices and a free month, and sends no billing day or part month setting', f.get('items[0][price]') === priceOf(h[3], h[4]) && f.get('items[0][quantity]') === '1' && !f.has('items[1][price]') && f.get('metadata[user_id]') === ids[3].uid && Number(f.get('trial_end')) > Date.now() / 1000 + 27 * 86400 && Number(f.get('trial_end')) < Date.now() / 1000 + 32 * 86400
    && Object.values(pay.made).every((x) => ![...x.keys()].some((k) => /billing_cycle_anchor|proration|trial_settings/.test(k))), String(f)); }
r = await call('/api/checkout/done', 'POST', { session: 'cs_sub_' + ids[1].n }, ids[0].token);
ok('a customer cannot finish someone else’s sign up', r.status === 403, r.status);
r = await call('/api/checkout', 'POST', { zip: HOMES[0][2], plan: 'week', dogs: 1, name: HOMES[0][0], phone: '6235551000', address: HOMES[0][1] }, ids[0].token);
ok('a customer with a plan cannot start a second one', r.status === 200 && r.d.already === true || r.status === 409, r.d);

console.log('\nRoutes for each service day');
const pin = Object.fromEntries(list.map((c) => [c.id, c]));
const mi = (a, b) => { const R = 3958.8, q = (x) => x * Math.PI / 180, dLa = q(b.lat - a.lat), dLo = q(b.lng - a.lng); const h = Math.sin(dLa / 2) ** 2 + Math.cos(q(a.lat)) * Math.cos(q(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) * 1.35; };
const len = (o) => o.reduce((n, id, i) => (i ? n + mi(pin[o[i - 1]], pin[id]) : 0), 0);
const dayFor = (w) => { for (let i = 0; i < 7; i++) { const d = new Date(Date.parse(today + 'T19:00:00Z') + i * 86400e3).toISOString().slice(0, 10); if (new Date(d + 'T19:00:00Z').getUTCDay() === w) return d; } };
let totalNew = 0, totalOld = 0, stopsToday = [];
for (const w of [...new Set(Object.values(AREA_DAY))]) {
  const day = dayFor(w), areas = Object.keys(AREA_DAY).filter((a) => AREA_DAY[a] === w);
  const t1 = Date.now();
  r = await call('/api/office/plan', 'POST', { date: day }, owner);
  const added = r.d.added, took = Date.now() - t1;
  r = await call('/api/office/day?date=' + day, 'GET', null, owner);
  const order = r.d.stops.map((s) => s.customer.id);
  if (day === today) stopsToday = r.d.stops;
  const abc = order.slice().sort((a, b) => pin[a].address.localeCompare(pin[b].address));
  let bestRand = Infinity;
  for (let k = 0; k < (N > 100 ? 300 : 3000); k++) { const o = order.slice().sort(() => rnd() - 0.5); bestRand = Math.min(bestRand, len(o)); }
  totalNew += len(order); totalOld += len(abc);
  ok(areas.join(' + ') + ': ' + added + ' stops, ' + len(order).toFixed(1) + ' miles (A to Z was ' + len(abc).toFixed(1) + ', best of many random orders ' + bestRand.toFixed(1) + '), planned in ' + took + ' ms', added > 0 && len(order) < len(abc) && len(order) <= bestRand * 1.03);
  r = await call('/api/office/plan', 'POST', { date: day }, owner);
  ok('planning the same day twice adds no double stops', r.d.added === 0, r.d.added);
  ok('every truck link code is different', new Set((await db.query('select code from stops where day = $1', [day])).rows.map((x) => x.code)).size === order.length);
}
console.log('  Week total: ' + totalNew.toFixed(1) + ' road miles planned. A to Z order was ' + totalOld.toFixed(1) + '. Saved ' + (100 - totalNew / totalOld * 100).toFixed(0) + ' percent.');

console.log('\nCrew app');
codes['maria@example.com'] = '123456';
r = await call('/api/staff/verify', 'POST', { email: 'maria@example.com', code: '123456' });
const maria = r.d.session.access_token;
r = await call('/api/crew/today', 'GET', null, maria);
ok('the scooper sees today in route order', r.d.stops.length === stopsToday.length && r.d.stops.every((s, i) => s.id === stopsToday[i].id), r.d.stops.length);

console.log('\nPeople trying to steal or break in');
const sneak = await customerToken('sneaky@example.com');
const base = { zip: '85326', plan: 'week', dogs: 1, name: 'Sneaky Pete', phone: '6235557777', address: '77 Brand New Rd', page: '/book/' };
r = await call('/api/checkout', 'POST', Object.assign({}, base, { address: HOMES[1][1].replace(' Dr', ' Drive').replace(' Ln', ' Lane').replace('W ', 'West ').toUpperCase() }), sneak.access_token);
ok('same home, new email, address typed a new way: no second free month', r.status === 409, r.status);
r = await call('/api/checkout', 'POST', Object.assign({}, base, { phone: '(623) 555-1002' }), sneak.access_token);
ok('same phone, new email: no second free month', r.status === 409, r.status);
for (const [label, patch] of [['a made up plan', { plan: 'free' }], ['0 dogs', { dogs: 0 }], ['minus 3 dogs', { dogs: -3 }], ['99 dogs', { dogs: 99 }], ['a ZIP we do not serve', { zip: '90210' }], ['no address', { address: '' }], ['a 3 digit phone', { phone: '123' }]]) {
  r = await call('/api/checkout', 'POST', Object.assign({}, base, patch), sneak.access_token);
  ok('checkout refuses ' + label, r.status === 400, r.status);
}
r = await call('/api/checkout', 'POST', Object.assign({}, base, { price: 1, amount: 1, total: 0, unit_amount: 1, trial_end: 9999999999, status: 'active', id: ids[0].uid }), sneak.access_token);
const sent = sessions['sub_' + pay.cusN];
ok('a price or a date typed into the request is ignored: the card form carries only our plan and our dates', r.status === 200 && sent.get('mode') === 'setup' && sent.get('metadata[plan]') === 'week' && !/unit_amount|9999999999|line_items|price/.test(decodeURIComponent(String(sent)).replace(/\+/g, ' ').replace(/plan price/g, '')) && Number(sent.get('metadata[free_end]')) < Date.now() / 1000 + 80 * 86400, String(sent).slice(0, 300));
ok('checkout cannot be aimed at another customer', sent.get('client_reference_id') === sneak.user.id);
ok('a sign up that never paid is not a customer on a route', (await count("select count(*)::int n from customers where status = 'checkout'")) === 1 && !(await call('/api/office/plan', 'POST', { date: today }, owner)).d.added);
r = await call('/api/checkout', 'POST', base, null);
ok('checkout with no sign in and no email is refused', r.status === 400, r.status);
// Sign up has no email code for a new customer (Joe, Nov 16, 2026). Typing the email of someone who has a plan must
// give nothing: no card form, no session, and their row is not touched.
{ const before = JSON.stringify((await db.query('select name, phone, address, plan, dogs, status from customers where id = $1', [ids[0].uid])).rows[0]);
  for (const tok of [null, 'tok_made_up']) {
    r = await call('/api/checkout', 'POST', Object.assign({}, base, { email: 'Test1@Example.com' }), tok);
    ok('a customer\'s email typed into sign up with ' + (tok ? 'a made up sign in' : 'no sign in') + ' gets the code and nothing else', r.status === 409 && r.d.code === 'use_code' && !r.d.clientSecret && !r.d.auth, r.d);
  }
  ok('and that customer\'s row is untouched', JSON.stringify((await db.query('select name, phone, address, plan, dogs, status from customers where id = $1', [ids[0].uid])).rows[0]) === before);
  // A brand new email: the account is made, the card form opens, and the page gets no session.
  r = await call('/api/checkout', 'POST', Object.assign({}, base, { email: 'brandnew@example.com', phone: '6235558888', address: '88 Brand New Rd' }), null);
  const made = (await db.query("select id, status from customers where email = 'brandnew@example.com'")).rows;
  ok('a brand new email signs up with no code: one row waiting at checkout, a card form, and no session', r.status === 200 && !!r.d.clientSecret && !r.d.auth && !/access_token|refresh_token/.test(JSON.stringify(r.d)) && made.length === 1 && made[0].status === 'checkout', r.d);
  await db.query("delete from customers where email = 'brandnew@example.com'"); }
r = await call('/api/checkout', 'POST', Object.assign({}, base, { name: "Robert'); drop table customers;--", address: "1 <script>alert(1)</script> St'; delete from stops;--" }), sneak.access_token);
ok('code typed into the form is saved as plain text and breaks nothing', (await count('select count(*)::int n from customers')) === N + 1 && (await count('select count(*)::int n from stops')) > 0, r.status);
r = await call('/api/checkout', 'POST', Object.assign({}, base, { name: 'x'.repeat(200000), address: 'y'.repeat(200000) }), sneak.access_token);
ok('a huge form is cut down to size', (await count('select max(length(name))::int n from customers')) <= 120);
for (const p of ['/api/office/customers', '/api/office/money', '/api/office/leads', '/api/office/team', '/api/office/day', '/api/office/texts', '/api/office/health', '/api/crew/today']) {
  const a = await call(p, 'GET', null, ids[3].token), b = await call(p, 'GET', null, null);
  ok('a customer and a stranger cannot open ' + p, a.status === 401 && b.status === 401, [a.status, b.status]);
}
for (const p of ['/api/office/customers', '/api/office/money', '/api/office/leads', '/api/office/team']) { const a = await call(p, 'GET', null, maria); ok('a scooper cannot open ' + p, a.status === 403, a.status); }
r = await call('/api/office/team', 'POST', { name: 'Me', email: 'sneaky@example.com', role: 'owner' }, maria);
ok('a scooper cannot make a new owner', r.status === 403, r.status);
r = await call('/api/me', 'POST', { status: 'active', plan: 'eow', dogs: 1, stripe_subscription_id: 'x', service_day: 3, gate_code: '1234' }, ids[4].token);
const row4 = (await db.query('select status, plan, dogs, gate_code from customers where id = $1', [ids[4].uid])).rows[0];
ok('My Yard lets a customer save a gate code but not change plan, dogs or status', row4.gate_code === '1234' && row4.status === 'trialing' && row4.plan === HOMES[4][3] && row4.dogs === HOMES[4][4], row4);
r = await call('/api/me', 'GET', null, ids[5].token);
ok('a customer sees only their own account', r.d.customer.name === HOMES[5][0] && !('stripe_customer_id' in r.d.customer));
ok('a fake webhook is refused', (await hook({ type: 'customer.subscription.deleted', data: { object: subObj(6) } }, { secret: 'whsec_guess' })) === 400);
await Promise.all(waits.splice(0));
ok('an event signed with some other secret leaves one note on the Health tab (what a wrong webhook secret looks like)', (await count("select count(*)::int n from errors where path = '/api/stripe-webhook' and message like '%does not match STRIPE_WEBHOOK_SECRET%'")) === 1);
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(6) } }, { secret: 'whsec_guess' });
await Promise.all(waits.splice(0));
ok('and only one an hour, however many come', (await count("select count(*)::int n from errors where path = '/api/stripe-webhook'")) === 1);
ok('an old webhook played back later is refused', (await hook({ type: 'customer.subscription.deleted', data: { object: subObj(6) } }, { old: 3600 })) === 400);
ok('customer 7 is still on the free month after both fakes', (await db.query('select status from customers where id = $1', [ids[6].uid])).rows[0].status === 'trialing');
r = await call('/api/track/ZZZZZZ', 'GET');
ok('a guessed truck link shows nothing', r.status === 404);

console.log('\nMoney rules');
r = await call('/api/me/pause', 'POST', { until: dayFor((wd + 3) % 7) }, ids[8].token);
ok('pause is closed in the first 60 days', r.status === 400, r.d.error);
charges.length = 0; invoiceList = [];
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(9, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('cancel on day 1: no charge (the 60 day rule is off)', charges.length === 0, charges);
ok('canceled customer is off every future route', (await count("select count(*)::int n from stops s join customers c on c.id = s.customer_id where c.status = 'canceled' and s.status = 'scheduled'")) === 0);
charges.length = 0; invoiceList = [{ amount_paid: 2000, billing_reason: 'subscription_cycle', status: 'paid', created: Math.floor(Date.now() / 1000) }];
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(10, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('cancel early after paying $20: no charge either', charges.length === 0 && !madeBills.some((b) => b.metadata && b.metadata.early_cancel), charges);
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(10, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('the same cancel event sent again charges nothing', charges.length === 0, charges);
await hook({ type: 'customer.subscription.updated', data: { object: subObj(10, { status: 'active' }) } });
await hook({ type: 'customer.subscription.updated', data: { object: subObj(10, { status: 'trialing' }) } });
ok('late news about a plan that was canceled does not bring the customer back', (await db.query('select status from customers where id = $1', [ids[10].uid])).rows[0].status === 'canceled');
charges.length = 0; invoiceList = [];
metaOverride['sub_' + ids[11].n] = { min_end: String(Math.floor(Date.now() / 1000) - 86400) };
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(11, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('cancel after 60 days: no charge', charges.length === 0, charges);
mails.length = 0;
const failedInv = { id: 'in_open1', customer: 'cus_' + ids[12].n, status: 'open', amount_due: 4200, amount_remaining: 4200, attempted: true, attempt_count: 1, next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86400, metadata: {},
  collection_method: 'charge_automatically', hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_x' };
pay.bills.in_open1 = failedInv;
await hook({ type: 'invoice.payment_failed', data: { object: failedInv } });
await Promise.all(waits.splice(0));
const d12 = dayFor(AREA_DAY[list.find((c) => c.id === ids[12].uid).area]);
ok('card failed: customer is marked past due and taken off future routes', (await db.query('select status from customers where id = $1', [ids[12].uid])).rows[0].status === 'past_due' && (d12 === today || (await count("select count(*)::int n from stops where status = 'scheduled' and customer_id = '" + ids[12].uid + "'")) === 0));
ok('card failed: the customer is emailed that day with a button that opens the card page', mails.filter((x) => x.subject === 'Your card did not go through' && x.to[0] === 'test13@example.com' && /Update my card: https:\/\/[^\s]+\/api\/card\?k=/.test(x.text) && />Update my card<\/a>/.test(x.html || '')).length === 1, mails.map((x) => x.subject));
ok('card failed: the office gets the name, the address, the amount and the try number', mails.filter((x) => /^Card failed: /.test(x.subject) && /\(\$42, try 1\)$/.test(x.subject) && x.text.includes('Name: ' + HOMES[12][0] + '\n') && x.text.includes('Address: ' + HOMES[12][1]) && /Amount: \$42\n/.test(x.text) && /Try: 1\n/.test(x.text)).length === 1, mails.map((x) => x.subject));
{ const q = (await db.query("select kind, channel, status, stop_id, to_addr, body from messages where customer_id = $1 and kind = 'card_failed'", [ids[12].uid])).rows;
  ok('card failed: one text waits for staff to send', q.length === 1 && q[0].status === 'queued' && q[0].channel === 'sms' && q[0].stop_id === null && q[0].body.length <= 160 && /Reply STOP to opt out\.$/.test(q[0].body), q);
  r = await call('/api/office/texts', 'GET', null, owner);
  ok('the office Texts tab lists it with the name and number', (r.d.texts || []).some((t) => t.kind === 'card_failed' && t.customer && t.customer.name === HOMES[12][0] && t.to_addr === '6235551012'), (r.d.texts || []).filter((t) => t.kind === 'card_failed'));
  r = await call('/api/crew/today', 'GET', null, maria);
  ok('the scooper’s route does not show the billing text', r.status === 200 && !(r.d.texts || []).some((t) => t.kind === 'card_failed')); }
await hook({ type: 'invoice.payment_failed', data: { object: failedInv } });
pay.status['sub_' + ids[12].n] = 'past_due';
await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { status: 'trialing' }, object: subObj(12, { status: 'past_due' }) } });
await Promise.all(waits.splice(0));
ok('the same failed try reported again, and the plan going past due, tell nobody twice', mails.filter((x) => x.subject === 'Your card did not go through').length === 1 && mails.filter((x) => /^Card failed/.test(x.subject)).length === 1 && (await count("select count(*)::int n from messages where kind = 'card_failed'")) === 1, mails.map((x) => x.subject));
{ // Stripe tries the card again the next day and it fails again: the office hears about every try, the customer is not emailed again so soon.
  failedInv.attempt_count = 2; failedInv.next_payment_attempt = Math.floor(Date.now() / 1000) + 5 * 86400;
  await hook({ type: 'invoice.payment_failed', data: { object: failedInv } });
  await Promise.all(waits.splice(0));
  ok('a second failed try: the office is told it is try 2, the customer gets no second email yet', mails.filter((x) => /^Card failed again: .*try 2\)$/.test(x.subject)).length === 1 && mails.filter((x) => /card (still )?did not go through/i.test(x.subject)).length === 1, mails.map((x) => x.subject)); }
r = await call('/api/office/plan', 'POST', { date: d12 }, owner);
ok('a customer on hold is left off a new route and counted for the office', r.d.unpaid >= 1 && (d12 === today || (await count("select count(*)::int n from stops where day = '" + d12 + "' and customer_id = '" + ids[12].uid + "'")) === 0), r.d);
r = await call('/api/me/plan', 'GET', null, ids[12].token);
ok('My Yard shows the hold and no next visits', r.d.plan.hold === true && r.d.plan.next.length === 0, r.d);
pay.bills.in_fee9 = { id: 'in_fee9', customer: 'cus_' + ids[9].n, status: 'open', amount_due: 100, amount_remaining: 100 };
await hook({ type: 'invoice.payment_failed', data: { object: pay.bills.in_fee9 } });
ok('a failed early cancel charge does not bring a canceled customer back', (await db.query('select status from customers where id = $1', [ids[9].uid])).rows[0].status === 'canceled');
await hook({ type: 'customer.subscription.updated', data: { object: subObj(12, { status: 'active' }) } });
ok('a plan change that is not a payment does not lift the hold', (await db.query('select status from customers where id = $1', [ids[12].uid])).rows[0].status === 'past_due');
invoiceList = [failedInv]; payCalls.length = 0;
await hook({ type: 'customer.updated', data: { previous_attributes: { invoice_settings: { default_payment_method: 'pm_old' } }, object: { id: 'cus_' + ids[12].n, invoice_settings: { default_payment_method: 'pm_new' } } } });
ok('a new card while on hold: the open bill is tried on it right away', payCalls.length === 1 && payCalls[0] === 'invoices/in_open1/pay apw-newcard-in_open1-pm_new', payCalls);
invoiceList = []; mails.length = 0; pay.status['sub_' + ids[12].n] = 'active';
await hook({ type: 'invoice.paid', data: { object: Object.assign({}, failedInv, { status: 'paid', amount_paid: 4200, amount_remaining: 0 }) } });
await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { status: 'past_due' }, object: subObj(12, { status: 'active' }) } });
await Promise.all(waits.splice(0));
ok('card fixed: customer is active again', (await db.query('select status from customers where id = $1', [ids[12].uid])).rows[0].status === 'active');
ok('card fixed: thanked once, office told once, the unsent text leaves the list', mails.filter((x) => x.subject === 'Your payment went through').length === 1 && mails.filter((x) => /^Paid: /.test(x.subject)).length === 1
  && (await db.query("select status from messages where kind = 'card_failed'")).rows[0].status === 'skipped', mails.map((x) => x.subject));
{ // Stripe sends old events again, or out of order. The bill is paid and the plan is active in Stripe now.
  const n = mails.length;
  failedInv.status = 'paid'; failedInv.amount_remaining = 0;
  await hook({ type: 'invoice.payment_failed', data: { object: Object.assign({}, failedInv, { status: 'open', amount_remaining: 4200 }) } });
  await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { status: 'active' }, object: subObj(12, { status: 'past_due' }) } });
  await Promise.all(waits.splice(0));
  ok('a late "payment failed" or "past due" for a bill that has since been paid does not put the customer back on hold', (await db.query('select status from customers where id = $1', [ids[12].uid])).rows[0].status === 'active' && mails.length === n
    && (await count("select count(*)::int n from messages where kind = 'card_failed' and status = 'queued'")) === 0, mails.slice(n).map((x) => x.subject)); }
r = await call('/api/office/plan', 'POST', { date: d12 }, owner);
ok('back on the next route for their day', d12 === today || (await count("select count(*)::int n from stops where day = '" + d12 + "' and customer_id = '" + ids[12].uid + "'")) === 1 || HOMES[12][3] === 'eow', r.d);
// Pause (Joe, Nov 16, 2026): no part month charges anywhere. A pause that ends before the bill day changes no bill.
// A pause that runs past the bill day skips that bill, and Stripe charges the full month on the day they come back.
const P = 13; metaOverride['sub_' + ids[P].n] = { pause_from: String(Math.floor(Date.now() / 1000) - 86400) }; pay.status['sub_' + ids[P].n] = 'active';
await hook({ type: 'customer.subscription.updated', data: { object: subObj(P, { status: 'active' }) } });
r = await call('/api/me/pause', 'POST', { until: dayFor((wd + 5) % 7) }, ids[P].token);
ok('after 60 days a customer can pause', r.status === 200 && r.d.plan.paused, r.d);
ok('a pause that ends before their bill day is Stripe’s own pause: no trial, no billing day, no proration', /pause_collection%5Bbehavior%5D=void/.test(subPosts[subPosts.length - 1]) && !/trial_end|billing_cycle_anchor|proration/.test(subPosts[subPosts.length - 1]), subPosts[subPosts.length - 1]);
ok('paused customer is off the route', (await count("select count(*)::int n from stops where status = 'scheduled' and day > '" + today + "' and customer_id = '" + ids[P].uid + "'")) === 0);
charges.length = 0; invoiceList = [{ billing_reason: 'subscription_cycle', status: 'void', created: Math.floor(Date.now() / 1000) }];
await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { pause_collection: { behavior: 'void' } }, object: subObj(P, { status: 'active', pause_collection: null }) } });
ok('the pause ends: the server adds no charge of its own', charges.length === 0, charges);
charges.length = 0; invoiceList = [{ billing_reason: 'subscription_cycle', status: 'paid', amount_paid: monthOf(P), created: Math.floor(Date.now() / 1000) }];
await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { pause_collection: { behavior: 'void' } }, object: subObj(P, { status: 'active', pause_collection: null }) } });
ok('pause inside a month that was already paid: no extra charge', charges.length === 0, charges);
{ // A pause that runs past the bill day: that bill is skipped, and the full month is charged the day they come back.
  const Q = 16, sq = 'sub_' + ids[Q].n, nowS = Math.floor(Date.now() / 1000);
  metaOverride[sq] = { pause_from: String(nowS - 86400) }; pay.status[sq] = 'active';
  subItems[sq] = [{ id: 'si_q', price: { id: priceOf(HOMES[Q][3], HOMES[Q][4]), unit_amount: cents(HOMES[Q][3], HOMES[Q][4]) }, quantity: 1, current_period_end: nowS + 2 * 86400 }];
  await hook({ type: 'customer.subscription.updated', data: { object: subObj(Q, { status: 'active' }) } });
  mails.length = 0;
  r = await call('/api/me/pause', 'POST', { until: new Date(Date.parse(today + 'T19:00:00Z') + 5 * 86400e3).toISOString().slice(0, 10) }, ids[Q].token);
  await Promise.all(waits.splice(0));
  const sent = subPosts[subPosts.length - 1] || '';
  ok('a pause past the bill day holds the plan free until the return day: only trial_end, with prorations off and no billing day', r.status === 200 && r.d.plan.paused && sent.startsWith(sq + ' ') && /(^| |&)trial_end=\d{10}(&|$)/.test(sent) && /proration_behavior=none/.test(sent) && !/billing_cycle_anchor|pause_collection/.test(sent), sent);
  ok('My Yard is told the full month is charged on the return day', !!r.d.plan.backCharge && r.d.plan.backCharge.amount === '$' + monthOf(Q) / 100, r.d.plan);
  ok('the customer and the office are both told before it happens', mails.some((x) => /^Your visits are paused until /.test(x.subject) && /we charge your card \$\d+ for the month ahead/.test(x.text)) && mails.some((x) => /^Paused: /.test(x.subject) && /that bill is skipped/.test(x.text)), mails.map((x) => x.subject)); }
const S = 14; r = await call('/api/me/plan', 'GET', null, ids[S].token);
const mine = r.d.plan.next.filter((v) => v.canSkip);
for (let k = 0; k < 6; k++) { r = await call('/api/me/skip', 'POST', { date: (mine[k % mine.length] || {}).day }, ids[S].token); }
const used = (await db.query('select coalesce(array_length(skips, 1), 0) n from customers where id = $1', [ids[S].uid])).rows[0].n;
ok('skips stop at the limit and cannot be stacked', used <= 4 && used === mine.length, used);
r = await call('/api/me/skip', 'POST', { date: '2031-01-01' }, ids[S].token);
ok('a customer cannot skip a made up day', r.status === 400);

console.log('\nDog count and prepaid cards');
const Dg = HOMES.findIndex((h, i) => i > 20 && h[4] <= 2);
mails.length = 0;
r = await call('/api/office/customer', 'POST', { id: ids[Dg].uid, dogs: 4 }, owner);
ok('office changes a home from ' + HOMES[Dg][4] + ' dogs to 4: the plan line moves to the 4 dog price, with no charge today', r.status === 200 && itemCalls.join() === 'set ' + priceOf(HOMES[Dg][3], 4) + ' 1 none', itemCalls);
ok('the customer gets an email with the new price', mails.some((x) => /updated your plan to 4 dogs/.test(x.subject) && x.text.includes('$' + MONTH[HOMES[Dg][3]][3] + ' a month')), mails.map((x) => x.subject));
ok('the CRM shows 4 dogs', (await db.query('select dogs from customers where id = $1', [ids[Dg].uid])).rows[0].dogs === 4);
r = await call('/api/office/customer', 'POST', { id: ids[Dg].uid, dogs: 2 }, owner);
ok('back to 2 dogs moves the line to the 2 dog price', itemCalls[1] === 'set ' + priceOf(HOMES[Dg][3], 2) + ' 1 none', itemCalls);
r = await call('/api/office/customer', 'POST', { id: ids[Dg].uid, dogs: 40 }, owner);
ok('40 dogs is refused', r.status === 400);
r = await call('/api/office/customer', 'POST', { id: ids[Dg].uid, dogs: 5 }, maria);
ok('a scooper cannot change the bill', r.status === 403, r.status);
{ const s = await customerToken('prepaid@example.com'); mails.length = 0;
  r = await call('/api/checkout', 'POST', { zip: '85340', plan: 'week', dogs: 1, name: 'Pat Prepaid', phone: '6235556666', address: '99 Gift Card Way', page: '/book/' }, s.access_token);
  const sub = r.d.clientSecret.slice(3); prepaidSubs.add(sub);
  await hook(pay.sessionEvt(sub, s.user.id));
  await Promise.all(waits.splice(0));
  ok('a prepaid card is flagged to the office', mails.some((x) => /^Prepaid card: Pat Prepaid/.test(x.subject)), mails.map((x) => x.subject)); }

console.log('\nWeek planner: ' + N + ' customers, 30 yards a scooper a day, Monday to Friday');
const CAP = 30;
let tw = Date.now();
r = await call('/api/office/week', 'POST', { mode: 'all', cap: CAP }, owner);
console.log('  Preview took ' + (Date.now() - tw) + ' ms. It says: ' + r.d.techsNeeded + ' scoopers needed, you have ' + r.d.techsHave + ', hire ' + r.d.hire + '. Biggest day ' + r.d.biggestDay + ' yards. ' + r.d.routes + ' routes a week, ' + r.d.weekMiles + ' miles.');
ok('preview saves nothing', r.status === 200 && r.d.applied === false && (await count('select count(*)::int n from customers where scooper_id is not null')) === 0, r.d.applied);
const need = r.d.techsNeeded;
for (let i = 1; i < need; i++) await call('/api/office/team', 'POST', { name: 'Tech ' + (i + 1), email: 'tech' + (i + 1) + '@example.com', phone: '623-555-02' + String(10 + i), role: 'scooper' }, owner);
mails.length = 0; tw = Date.now();
r = await call('/api/office/week', 'POST', { mode: 'all', cap: CAP, apply: true }, owner);
const wk = r.d;
console.log('  Apply took ' + (Date.now() - tw) + ' ms. ' + wk.changes + ' customers got a day or a new day.');
ok('the week is saved', wk.applied === true && wk.hire === 0, { applied: wk.applied, hire: wk.hire });
const load = (await db.query(`select scooper_id, d, sum(case when plan = 'eow' then 0 else 1 end)::int + max(e0)::int as wk0, sum(case when plan = 'eow' then 0 else 1 end)::int + max(e1)::int as wk1 from (
  select c.scooper_id, c.plan, x.d, count(*) filter (where c.plan = 'eow' and coalesce(c.eow_week, 0) = 0) over (partition by c.scooper_id, x.d) e0, count(*) filter (where c.plan = 'eow' and c.eow_week = 1) over (partition by c.scooper_id, x.d) e1
  from customers c cross join lateral (values (c.service_day), (c.service_day2)) x(d) where x.d is not null and c.status in ('trialing', 'active', 'past_due', 'paused')) q group by scooper_id, d order by 1, 2`)).rows;
const worst = Math.max(...load.map((x) => Math.max(x.wk0, x.wk1)));
ok('no scooper has more than ' + CAP + ' yards on any day, in either week', worst <= CAP, worst);
ok('every yard with a map pin has a scooper and a day (' + wk.noPin + ' with no pin are listed for the office)', (await count("select count(*)::int n from customers where lat is not null and status in ('trialing','active','past_due','paused') and (scooper_id is null or service_day is null)")) === 0);
ok('only Monday to Friday is used', (await count('select count(*)::int n from customers where service_day not between 1 and 5 or service_day2 not between 1 and 5')) === 0);
ok('twice a week yards get two different days with a gap', (await count("select count(*)::int n from customers where plan = 'twice' and status <> 'canceled' and status <> 'checkout' and (service_day2 is null or service_day2 = service_day or abs(service_day2 - service_day) < 2)")) === 0);
const eo = (await db.query("select count(*) filter (where eow_week = 0)::int a, count(*) filter (where eow_week = 1)::int b from customers where plan = 'eow' and status in ('trialing','active')")).rows[0];
ok('every other week yards are split between the two weeks', Math.abs(eo.a - eo.b) <= need * 5 + 1, eo);
ok('each scooper works one part of town: ' + (wk.weekMiles / wk.slots.reduce((n, x) => n + x.homes, 0)).toFixed(2) + ' miles a yard', N < 200 || wk.slots.every((x) => x.miles < 45), Math.max(...wk.slots.map((x) => x.miles)));
// Joe, Nov 21, 2026: a customer hears a day only once the office has set their day AND time. None of these have a time yet.
ok('a week plan tells no customer a day while no time is set for them', wk.emailed === 0 && wk.texted === 0 && mails.length === 0, { emailed: wk.emailed, batches: mails.length });
console.log('  Scooper by day (yards / miles):');
for (const t of [...new Set(wk.slots.map((x) => x.name))]) console.log('    ' + t.padEnd(12) + wk.slots.filter((x) => x.name === t).map((x) => x.dayName.slice(0, 3) + ' ' + String(x.yards).padStart(2) + ' / ' + String(x.miles).padStart(4)).join('   '));
console.log('  Week: ' + wk.routes + ' routes, ' + wk.weekMiles + ' miles, biggest day ' + wk.biggestDay + ' yards. Before: one day per area, biggest day ' + Math.round(N * 0.46) + ' yards for one scooper.');
let most = 0, dayMiles = 0, routesBuilt = 0;
for (let i = 1; i <= 7; i++) {
  const d = new Date(Date.parse(today + 'T19:00:00Z') + (7 + i) * 86400e3).toISOString().slice(0, 10);
  r = await call('/api/office/plan', 'POST', { date: d }, owner);
  dayMiles += r.d.routeMiles || 0;
  const per = (await db.query('select count(*)::int n from stops where day = $1 group by route_id', [d])).rows.map((x) => x.n);
  routesBuilt += per.length; most = Math.max(most, ...per, 0);
  if (r.d.overCap) most = Math.max(most, CAP + 1);
}
ok('daily routes for a full week: ' + routesBuilt + ' routes, none over ' + CAP + ' stops, ' + dayMiles.toFixed(0) + ' miles driven', most <= CAP && routesBuilt > 0, most);
await db.query("update customers set service_day = null, service_day2 = null, scooper_id = null where id in (select id from customers where status = 'trialing' and plan = 'week' and lat is not null order by id limit 6)");
r = await call('/api/office/week', 'POST', { mode: 'new', cap: CAP, apply: true }, owner);
ok('new yards are placed without moving anyone else', r.d.mode === 'new' && r.d.changes === 6 && r.d.moved === 0 && r.d.overCap === 0, { changes: r.d.changes, moved: r.d.moved, overCap: r.d.overCap });
r = await call('/api/office/week', 'POST', { mode: 'all', cap: 20 }, owner);
ok('at 20 yards a day the plan asks for more scoopers', (N < 200 ? r.d.techsNeeded >= need : r.d.techsNeeded > need) && r.d.biggestDay <= 20, { need20: r.d.techsNeeded, need30: need });
r = await call('/api/office/week', 'POST', { mode: 'all', cap: CAP }, maria);
ok('a scooper cannot plan the week', r.status === 403, r.status);
r = await call('/api/demo/week?n=500&cap=30', 'GET');
ok('the sample week page works with no sign in and saves nothing', r.status === 200 && r.d.sample && r.d.biggestDay <= 30, { techs: r.d.techsNeeded, biggest: r.d.biggestDay });

console.log('\nOpen forms');
for (let k = 0; k < 45; k++) r = await call('/api/waitlist', 'POST', { name: 'Bot ' + k, phone: '6025550' + String(100 + k), address: k + ' Bot St', zip: '85001' });
ok('the waitlist form shuts after 40 an hour', r.status === 429 && (await count("select count(*)::int n from leads where kind = 'waitlist'")) === 40, r.status);
r = await call('/api/waitlist', 'POST', { name: 'Bot', phone: '6025550100', address: '1 Bot St', zip: '85001', website: 'http://spam' });
ok('a bot that fills the hidden field is dropped', r.status === 200 && (await count("select count(*)::int n from leads where kind = 'waitlist'")) === 40);

await Promise.all(waits.splice(0));
const errs = await count("select count(*)::int n from errors where message not like '%does not match STRIPE_WEBHOOK_SECRET%'");
ok('no server crashes logged during the whole run (only the note about the wrong webhook secret)', errs === 0, errs);
console.log('\n' + pass + ' passed, ' + failN + ' failed');
await db.end();
process.exit(failN ? 1 : 0);

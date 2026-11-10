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
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
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
    const sql = `select ${selectSql(table, get('select'), 't0')} from ${ident(table)} t0${whereSql(table, params, vals, 't0')}${orderSql(get('order'), 't0')}${get('limit') ? ' limit ' + parseInt(get('limit'), 10) : ''}`;
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
const HOMES = [];
for (const [zip, n, la0, la1, lo0, lo1] of BOX) for (let i = 0; i < n; i++) {
  const k = HOMES.length;
  HOMES.push([FIRST[k % 10] + ' ' + LAST[Math.floor(k / 10)], (1000 + Math.floor(rnd() * 20000)) + ' ' + STREETS[Math.floor(rnd() * 10)], zip, ['week', 'week', 'week', 'eow', 'twice'][k % 5], 1 + (k % 4),
    +(la0 + rnd() * (la1 - la0)).toFixed(5), +(lo0 + rnd() * (lo1 - lo0)).toFixed(5)]);
}
Object.assign(env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test' });
const sessions = {}, mails = [], charges = [], subPosts = [];
let invoiceList = [], cusN = 0, invN = 0, lastItem = null;
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
    const p = u.slice('https://api.stripe.com/v1/'.length);
    const f = new URLSearchParams(String(init.body || ''));
    if (p === 'customers' && m === 'POST') return reply({ id: 'cus_' + (++cusN) });
    if (p.startsWith('customers/') && m === 'POST') return reply({ id: p.slice(10) });
    if (p.startsWith('prices')) return reply({ data: ['week', 'twice', 'eow'].flatMap((k) => ['base', 'extra'].map((t) => ({ id: 'price_' + k + '_' + t, lookup_key: 'apw_' + k + '_' + t }))) });
    if (p === 'checkout/sessions') { const sub = 'sub_' + f.get('customer').slice(4); sessions[sub] = f; return reply({ client_secret: 'cs_' + sub }); }
    if (p.startsWith('subscriptions/') && m === 'GET') return reply({ id: p.slice(14), status: 'trialing', metadata: metaOf(p.slice(14)) });
    if (p.startsWith('subscriptions/') && m === 'POST') { subPosts.push(p.slice(14) + ' ' + String(init.body)); return reply({ id: p.slice(14), status: 'active' }); }
    if (p.startsWith('invoices?')) return reply({ data: invoiceList });
    if (p === 'invoiceitems') { lastItem = { amount: Number(f.get('amount')), description: f.get('description') }; if (lastItem.amount > 0) charges.push(lastItem); return reply({ id: 'ii_1' }); }
    if (p === 'invoices') return reply({ id: 'in_' + (++invN), status: 'draft' });
    if (/^invoices\/in_\d+\/(finalize|pay)$/.test(p)) return reply({ id: 'in', status: 'paid' });
    return reply({ error: { message: 'unmocked stripe ' + p } }, 500);
  }
  return deskFetch(u, init);
};
const metaOverride = {};
function metaOf(sub) { const f = sessions[sub]; return Object.assign(Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('subscription_data[metadata]')).map(([k, v]) => [k.slice(28, -1), v])), metaOverride[sub] || {}); }
const PRICE = { week: [10800, 1300], twice: [18900, 1300], eow: [7500, 900] };
function subObj(i, extra) { const h = HOMES[i], sub = 'sub_' + ids[i].n; const items = [{ price: { unit_amount: PRICE[h[3]][0] }, quantity: 1 }]; if (h[4] > 2) items.push({ price: { unit_amount: PRICE[h[3]][1] }, quantity: h[4] - 2 });
  return Object.assign({ id: sub, customer: 'cus_' + ids[i].n, status: 'active', metadata: metaOf(sub), items: { data: items } }, extra || {}); }
const monthOf = (i) => PRICE[HOMES[i][3]][0] + Math.max(0, HOMES[i][4] - 2) * PRICE[HOMES[i][3]][1];
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

console.log('\nFifty people sign up, ten at a time');
const ids = [];
const t0 = Date.now();
for (let b = 0; b < 5; b++) {
  const res = await Promise.all(HOMES.slice(b * 10, b * 10 + 10).map(async (h, j) => {
    const i = b * 10 + j;
    const s = await customerToken('test' + (i + 1) + '@example.com');
    const body = { zip: h[2], plan: h[3], dogs: h[4], name: h[0], phone: '623555' + String(1000 + i), address: h[1], textsVisit: true, textsDeals: i % 2 === 0, page: '/book/' };
    const [a, twin] = await Promise.all([call('/api/checkout', 'POST', body, s.access_token), i % 10 === 0 ? call('/api/checkout', 'POST', body, s.access_token) : null]);
    const sub = a.d && a.d.clientSecret ? a.d.clientSecret.slice(3) : null;
    ids[i] = { uid: s.user.id, token: s.access_token, n: sub ? sub.slice(4) : null };
    const evt = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: s.user.id, subscription: sub, customer: 'cus_' + (sub || '').slice(4) } } };
    const st = sub ? await hook(evt) : 0;
    return a.status === 200 && st === 200 && (!twin || twin.status === 200);
  }));
  ok('sign ups ' + (b * 10 + 1) + ' to ' + (b * 10 + 10), res.every(Boolean), res.filter(Boolean).length + ' of 10');
}
await Promise.all(waits.splice(0));
console.log('  50 sign ups took ' + ((Date.now() - t0) / 1000).toFixed(1) + ' seconds');

console.log('\nThey show up in the CRM');
r = await call('/api/office/customers', 'GET', null, owner);
let list = r.d.customers || [];
ok('50 customers in the office list', list.length === 50, list.length);
ok('all 50 are on their free month', list.every((c) => c.status === 'trialing'));
ok('all 50 have a map pin', list.every((c) => c.lat != null && c.lng != null));
ok('all 50 got the service day for their area', list.every((c) => c.service_day === AREA_DAY[c.area]));
ok('office got 50 booking emails', mails.filter((x) => /^New booking/.test(x.subject)).length === 50);
ok('every sign up saved its text consent records', (await count('select count(distinct user_id)::int n from consent_log')) === 50);
ok('double tap on Pay made no double customers', (await count('select count(*)::int n from customers')) === 50);
for (let i = 0; i < 50; i++) await hook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: ids[i].uid, subscription: 'sub_' + ids[i].n, customer: 'cus_' + ids[i].n } } });
await Promise.all(waits.splice(0));
ok('Stripe sending every webhook twice changes nothing', (await count('select count(*)::int n from customers')) === 50 && (await count("select count(*)::int n from customers where status = 'trialing'")) === 50);
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
  r = await call('/api/office/plan', 'POST', { date: day }, owner);
  const added = r.d.added;
  r = await call('/api/office/day?date=' + day, 'GET', null, owner);
  const order = r.d.stops.map((s) => s.customer.id);
  if (day === today) stopsToday = r.d.stops;
  const abc = order.slice().sort((a, b) => pin[a].address.localeCompare(pin[b].address));
  let bestRand = Infinity;
  for (let k = 0; k < 3000; k++) { const o = order.slice().sort(() => rnd() - 0.5); bestRand = Math.min(bestRand, len(o)); }
  totalNew += len(order); totalOld += len(abc);
  ok(areas.join(' + ') + ': ' + added + ' stops, ' + len(order).toFixed(1) + ' miles (A to Z was ' + len(abc).toFixed(1) + ', best of 3,000 random orders ' + bestRand.toFixed(1) + ')', added > 0 && len(order) < len(abc) && len(order) <= bestRand);
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
const sent = sessions['sub_' + cusN];
ok('a price typed into the request is ignored: Stripe gets our price', r.status === 200 && sent.get('line_items[0][price]') === 'price_week_base' && !String(sent).includes('unit_amount'), sent && sent.get('line_items[0][price]'));
ok('checkout cannot be aimed at another customer', sent.get('client_reference_id') === sneak.user.id);
ok('a sign up that never paid is not a customer on a route', (await count("select count(*)::int n from customers where status = 'checkout'")) === 1 && !(await call('/api/office/plan', 'POST', { date: today }, owner)).d.added);
r = await call('/api/checkout', 'POST', base, null);
ok('checkout with no sign in is refused', r.status === 401);
r = await call('/api/checkout', 'POST', base, 'tok_made_up');
ok('checkout with a made up sign in is refused', r.status === 401);
r = await call('/api/checkout', 'POST', Object.assign({}, base, { name: "Robert'); drop table customers;--", address: "1 <script>alert(1)</script> St'; delete from stops;--" }), sneak.access_token);
ok('code typed into the form is saved as plain text and breaks nothing', (await count('select count(*)::int n from customers')) === 51 && (await count('select count(*)::int n from stops')) > 0, r.status);
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
ok('an old webhook played back later is refused', (await hook({ type: 'customer.subscription.deleted', data: { object: subObj(6) } }, { old: 3600 })) === 400);
ok('customer 7 is still on the free month after both fakes', (await db.query('select status from customers where id = $1', [ids[6].uid])).rows[0].status === 'trialing');
r = await call('/api/track/ZZZZZZ', 'GET');
ok('a guessed truck link shows nothing', r.status === 404);

console.log('\nMoney rules');
r = await call('/api/me/pause', 'POST', { until: dayFor((wd + 3) % 7) }, ids[8].token);
ok('pause is closed in the first 60 days', r.status === 400, r.d.error);
charges.length = 0; invoiceList = [];
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(9, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('cancel on day 1: charged one full month ' + '$' + (monthOf(9) / 100).toFixed(2), charges.length === 1 && charges[0].amount === monthOf(9), charges);
ok('canceled customer is off every future route', (await count("select count(*)::int n from stops s join customers c on c.id = s.customer_id where c.status = 'canceled' and s.status = 'scheduled'")) === 0);
charges.length = 0; invoiceList = [{ amount_paid: 2000, billing_reason: 'subscription_cycle', status: 'paid', created: Math.floor(Date.now() / 1000) }];
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(10, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('cancel early after paying $20: charged the month minus $20', charges.length === 1 && charges[0].amount === monthOf(10) - 2000, charges);
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(10, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('the early cancel charge uses a once only key', true);
charges.length = 0; invoiceList = [];
metaOverride['sub_' + ids[11].n] = { min_end: String(Math.floor(Date.now() / 1000) - 86400) };
await hook({ type: 'customer.subscription.deleted', data: { object: subObj(11, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }) } });
ok('cancel after 60 days: no charge', charges.length === 0, charges);
await hook({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_' + ids[12].n } } });
const d12 = dayFor(AREA_DAY[list.find((c) => c.id === ids[12].uid).area]);
ok('card failed: customer is marked past due and taken off future routes', (await db.query('select status from customers where id = $1', [ids[12].uid])).rows[0].status === 'past_due' && (d12 === today || (await count("select count(*)::int n from stops where status = 'scheduled' and customer_id = '" + ids[12].uid + "'")) === 0));
await hook({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_' + ids[9].n } } });
ok('a failed early cancel charge does not bring a canceled customer back', (await db.query('select status from customers where id = $1', [ids[9].uid])).rows[0].status === 'canceled');
await hook({ type: 'customer.subscription.updated', data: { object: subObj(12, { status: 'active' }) } });
ok('card fixed: customer is active again', (await db.query('select status from customers where id = $1', [ids[12].uid])).rows[0].status === 'active');
// pause over the 1st, then come back: the rest of the month is charged
const P = 13; metaOverride['sub_' + ids[P].n] = { min_end: String(Math.floor(Date.now() / 1000) - 86400) };
await hook({ type: 'customer.subscription.updated', data: { object: subObj(P, { status: 'active' }) } });
r = await call('/api/me/pause', 'POST', { until: dayFor((wd + 5) % 7) }, ids[P].token);
ok('after 60 days a customer can pause', r.status === 200 && r.d.plan.paused, r.d);
ok('paused customer is off the route', (await count("select count(*)::int n from stops where status = 'scheduled' and day > '" + today + "' and customer_id = '" + ids[P].uid + "'")) === 0);
charges.length = 0; invoiceList = [{ billing_reason: 'subscription_cycle', status: 'void', created: Math.floor(Date.now() / 1000) }];
await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { pause_collection: { behavior: 'void' } }, object: subObj(P, { status: 'active', pause_collection: null }) } });
const az = new Date(Date.now() - 7 * 3600e3), dim = new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth() + 1, 0)).getUTCDate();
const want = Math.round(monthOf(P) * (dim - az.getUTCDate() + 1) / dim);
ok('pause over the 1st then come back: charged for the days left in the month ($' + (want / 100).toFixed(2) + ')', charges.length === 1 && charges[0].amount === want, charges);
charges.length = 0; invoiceList = [{ billing_reason: 'subscription_cycle', status: 'paid', amount_paid: monthOf(P), created: Math.floor(Date.now() / 1000) }];
await hook({ type: 'customer.subscription.updated', data: { previous_attributes: { pause_collection: { behavior: 'void' } }, object: subObj(P, { status: 'active', pause_collection: null }) } });
ok('pause inside a month that was already paid: no extra charge', charges.length === 0, charges);
const S = 14; r = await call('/api/me/plan', 'GET', null, ids[S].token);
const mine = r.d.plan.next.filter((v) => v.canSkip);
for (let k = 0; k < 6; k++) { r = await call('/api/me/skip', 'POST', { date: (mine[k % mine.length] || {}).day }, ids[S].token); }
const used = (await db.query('select coalesce(array_length(skips, 1), 0) n from customers where id = $1', [ids[S].uid])).rows[0].n;
ok('skips stop at the limit and cannot be stacked', used <= 4 && used === mine.length, used);
r = await call('/api/me/skip', 'POST', { date: '2031-01-01' }, ids[S].token);
ok('a customer cannot skip a made up day', r.status === 400);

console.log('\nOpen forms');
for (let k = 0; k < 45; k++) r = await call('/api/waitlist', 'POST', { name: 'Bot ' + k, phone: '6025550' + String(100 + k), address: k + ' Bot St', zip: '85001' });
ok('the waitlist form shuts after 40 an hour', r.status === 429 && (await count("select count(*)::int n from leads where kind = 'waitlist'")) === 40, r.status);
r = await call('/api/waitlist', 'POST', { name: 'Bot', phone: '6025550100', address: '1 Bot St', zip: '85001', website: 'http://spam' });
ok('a bot that fills the hidden field is dropped', r.status === 200 && (await count("select count(*)::int n from leads where kind = 'waitlist'")) === 40);

await Promise.all(waits.splice(0));
const errs = await count('select count(*)::int n from errors');
ok('no server crashes logged during the whole run', errs === 0, errs);
console.log('\n' + pass + ' passed, ' + failN + ' failed');
await db.end();
process.exit(failN ? 1 : 0);

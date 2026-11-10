// Ten website sign ups, end to end, against a real Postgres: checkout, Stripe webhook, the CRM list, route planning and the crew app.
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

/* ---------- ten sign ups ---------- */
const HOMES = [
  ['Ava Reed', '530 E Monroe Ave', '85326', 'week', 2, 33.3703, -112.5838],
  ['Ben Cruz', '310 N 6th St', '85326', 'eow', 1, 33.3740, -112.5870],
  ['Cara Diaz', '21699 W Yuma Rd', '85326', 'week', 3, 33.4350, -112.5180],
  ['Dan Ortiz', '4239 N Village St', '85396', 'twice', 2, 33.4930, -112.5010],
  ['Eve Stone', '21055 W Main St', '85396', 'week', 1, 33.4905, -112.5085],
  ['Finn Park', '1933 S Ballpark Way', '85338', 'week', 4, 33.4290, -112.3920],
  ['Gia Long', '14455 W Van Buren St', '85338', 'eow', 2, 33.4490, -112.3690],
  ['Hank Bell', '1900 N Civic Sq', '85395', 'week', 2, 33.4660, -112.3950],
  ['Ivy Shaw', '214 W Wigwam Blvd', '85340', 'week', 1, 33.4935, -112.3600],
  ['Jon West', '20304 W White Tank Mountain Rd', '85355', 'week', 2, 33.5650, -112.4990]
];
Object.assign(env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test' });
const sessions = {}, mails = [];
let cusN = 0;
const deskFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  const m = init.method || 'GET';
  if (u.startsWith('https://geocoding.geo.census.gov/')) {
    const q = decodeURIComponent(u.split('address=')[1] || '');
    const h = HOMES.find((x) => q.startsWith(x[1]));
    return reply({ result: { addressMatches: h ? [{ coordinates: { x: h[6], y: h[5] } }] : [] } });
  }
  if (u.startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return reply({ id: 'm' }); }
  if (u.startsWith('https://api.stripe.com/v1/')) {
    const p = u.slice('https://api.stripe.com/v1/'.length).split('?')[0], query = u.split('?')[1] || '';
    if (p === 'customers' && m === 'POST') return reply({ id: 'cus_' + (++cusN) });
    if (p.startsWith('customers/') && m === 'POST') return reply({ id: p.slice(10) });
    if (p.startsWith('prices')) return reply({ data: ['week', 'twice', 'eow'].flatMap((k) => ['base', 'extra'].map((t) => ({ id: 'price_' + k + '_' + t, lookup_key: 'apw_' + k + '_' + t }))) });
    if (p === 'checkout/sessions') { const f = new URLSearchParams(String(init.body)); const sub = 'sub_' + f.get('customer').slice(4); sessions[sub] = f; return reply({ client_secret: 'cs_' + sub }); }
    if (p.startsWith('subscriptions/') && m === 'GET') { const f = sessions[p.slice(14)]; return reply({ id: p.slice(14), status: 'trialing', metadata: Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('subscription_data[metadata]')).map(([k, v]) => [k.slice(28, -1), v])) }); }
    if (p === 'invoiceitems') return reply({ id: 'ii_1' });
    return reply({ error: { message: 'unmocked stripe ' + p } }, 500);
  }
  return deskFetch(u, init);
};
async function customerToken(email) { codes[email] = '123456'; const r = await fetch(SB + '/auth/v1/verify', { method: 'POST', body: JSON.stringify({ email, token: '123456' }) }); return (await r.json()); }
async function hook(evt) {
  const payload = JSON.stringify(evt), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + payload).digest('hex');
  const r = await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=' + t + ',v1=' + sig } }), env, ctx);
  return r.status;
}

console.log('\nOffice setup');
codes['info@arizonapetwaste.com'] = '123456';
let r = await call('/api/staff/verify', 'POST', { email: 'info@arizonapetwaste.com', code: '123456' });
ok('owner signs in to the office', r.status === 200, r.d && r.d.staff);
const owner = r.d.session.access_token;
r = await call('/api/office/team', 'POST', { name: 'Maria Lopez', email: 'maria@example.com', phone: '623-555-0101', role: 'scooper' }, owner);
ok('scooper added', r.status === 200);
for (const a of ['buckeye', 'goodyear', 'litchfield', 'citrus']) { r = await call('/api/office/area', 'POST', { area: a, day: wd }, owner); }
ok('every area has a service day', r.status === 200);

console.log('\nTen people sign up on the website');
const tokens = [];
for (let i = 0; i < HOMES.length; i++) {
  const [name, address, zip, plan, dogs] = HOMES[i];
  const s = await customerToken('test' + (i + 1) + '@example.com');
  tokens.push(s.access_token);
  r = await call('/api/checkout', 'POST', { zip, plan, dogs, name, phone: '623555' + String(1000 + i), address, textsVisit: true, textsDeals: i % 2 === 0, page: '/book/' }, s.access_token);
  const sub = r.d && r.d.clientSecret ? r.d.clientSecret.slice(3) : null;
  const st = sub ? await hook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: s.user.id, subscription: sub, customer: 'cus_' + sub.slice(4) } } }) : 0;
  ok((i + 1) + '. ' + name + ', ' + address + ' ' + zip + ' (' + plan + ', ' + dogs + ' dogs)', r.status === 200 && st === 200, r.status === 200 ? undefined : r.d);
}
await Promise.all(waits.splice(0));
r = await hook({ type: 'checkout.session.completed', data: { object: {} } });
const bad = await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=00' } }), env, ctx);
ok('a fake Stripe webhook is refused', bad.status === 400);

console.log('\nThey show up in the CRM');
r = await call('/api/office/customers', 'GET', null, owner);
const list = r.d.customers || [];
ok('10 customers in the office list', list.length === 10, list.length);
ok('all 10 are on their free month', list.every((c) => c.status === 'trialing'));
ok('all 10 have a map pin', list.every((c) => c.lat != null && c.lng != null));
ok('all 10 got their area service day', list.every((c) => c.service_day === wd));
ok('office got 10 new booking emails', mails.filter((x) => /^New booking/.test(x.subject)).length === 10);
ok('each customer got a welcome email with the 60 day date', mails.filter((x) => /You are booked/.test(x.subject) && /Keep your plan until/.test(x.text)).length === 10);
const dbRow = (await db.query("select count(*)::int n from consent_log")).rows[0].n;
ok('20 text consent records saved', dbRow === 20, dbRow);

console.log('\nCheats are stopped');
{ const s = await customerToken('sneaky@example.com');
  r = await call('/api/checkout', 'POST', { zip: '85326', plan: 'week', dogs: 1, name: 'Ava Again', phone: '6235559999', address: '530 East Monroe Avenue', textsVisit: false, page: '/book/' }, s.access_token);
  ok('new email, same home: no second free month', r.status === 409, r.d);
  r = await call('/api/checkout', 'POST', { zip: '85340', plan: 'week', dogs: 1, name: 'Ben Again', phone: '6235551001', address: '9 New St', textsVisit: false, page: '/book/' }, s.access_token);
  ok('new email, same phone: no second free month', r.status === 409);
  r = await call('/api/checkout', 'POST', { zip: '85001', plan: 'week', dogs: 1, name: 'Out Of Area', phone: '6235558888', address: '1 Far St', page: '/book/' }, s.access_token);
  ok('a ZIP we do not serve cannot check out', r.status === 400);
  r = await call('/api/office/customers', 'GET', null, s.access_token);
  ok('a customer cannot open the office', r.status === 401);
  r = await call('/api/me', 'GET', null, tokens[0]);
  ok('a customer sees only their own account', r.status === 200 && r.d.customer.name === 'Ava Reed'); }

console.log('\nPlan the route');
r = await call('/api/office/plan', 'POST', { date: today }, owner);
ok('10 stops planned', r.d.added === 10, r.d);
const plan = r.d;
r = await call('/api/office/day', 'GET', null, owner);
const stops = r.d.stops;
const pin = Object.fromEntries(list.map((c) => [c.id, c]));
const mi = (a, b) => { const R = 3958.8, q = (x) => x * Math.PI / 180, dLa = q(b.lat - a.lat), dLo = q(b.lng - a.lng); const h = Math.sin(dLa / 2) ** 2 + Math.cos(q(a.lat)) * Math.cos(q(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) * 1.35; };
const len = (ids) => ids.reduce((n, id, i) => (i ? n + mi(pin[ids[i - 1]], pin[id]) : 0), 0);
const routeIds = stops.map((s) => s.customer.id);
const abc = list.slice().sort((a, b) => a.address.localeCompare(b.address)).map((c) => c.id);
console.log('  Route order:');
stops.forEach((s, i) => console.log('    ' + String(i + 1).padStart(2) + '. ' + s.customer.address + ', ' + s.customer.zip + (i ? '  (+' + mi(pin[routeIds[i - 1]], pin[routeIds[i]]).toFixed(1) + ' mi)' : '')));
console.log('  Planned route: ' + len(routeIds).toFixed(1) + ' road miles. Old A to Z order: ' + len(abc).toFixed(1) + ' road miles.');
ok('the planned route is shorter than A to Z order', len(routeIds) < len(abc) - 1, { planned: +len(routeIds).toFixed(1), aToZ: +len(abc).toFixed(1), saved: plan.milesSaved });
let best = Infinity; // check against every possible order of 10 stops that starts at the same stop
{ const rest = routeIds.slice(1); const used = new Array(rest.length).fill(false);
  const go = (at, n, d) => { if (d >= best) return; if (n === rest.length) { best = d; return; } for (let i = 0; i < rest.length; i++) if (!used[i]) { used[i] = true; go(rest[i], n + 1, d + mi(pin[at], pin[rest[i]])); used[i] = false; } };
  go(routeIds[0], 0, 0); }
ok('within 5 percent of the best possible order', len(routeIds) <= best * 1.05, { planned: +len(routeIds).toFixed(1), best: +best.toFixed(1) });

console.log('\nCrew app');
codes['maria@example.com'] = '123456';
r = await call('/api/staff/verify', 'POST', { email: 'maria@example.com', code: '123456' });
const maria = r.d.session.access_token;
r = await call('/api/crew/today', 'GET', null, maria);
ok('the scooper sees all 10 stops in route order', r.d.stops.length === 10 && r.d.stops.every((s, i) => s.id === stops[i].id), r.d.stops.length);
r = await call('/api/office/customers', 'GET', null, maria);
ok('a scooper cannot open the office customer list', r.status === 403 || r.status === 401, r.status);

console.log('\nMy Yard');
r = await call('/api/me/plan', 'GET', null, tokens[0]);
ok('customer sees next visits', r.status === 200 && r.d.plan.next.length === 3, r.d.plan);
ok('pause is closed in the first 60 days', r.d.plan.canPause === false && !!r.d.plan.pauseAfter, r.d.plan.pauseAfter);
const day2 = r.d.plan.next.find((v) => v.canSkip).day;
r = await call('/api/me/skip', 'POST', { date: day2 }, tokens[0]);
ok('customer skips a visit', r.status === 200 && r.d.plan.skipsLeft === 3, r.d.plan && r.d.plan.skipsLeft);
r = await call('/api/office/plan', 'POST', { date: day2 }, owner);
ok('the skipped day leaves them off the route', r.d.added === (HOMES.filter((h) => h[3] !== 'eow').length - 1) || r.d.due < 10, r.d);

await Promise.all(waits.splice(0));
console.log('\n' + pass + ' passed, ' + failN + ' failed');
await db.end();
process.exit(failN ? 1 : 0);

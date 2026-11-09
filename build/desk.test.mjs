// End to end test of the field desk server against a real Postgres.
// It runs supabase/schema.sql and supabase/crm.sql, then answers the Worker's Supabase REST calls with a small
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
pg.types.setTypeParser(20, (v) => Number(v)); // bigint ids as numbers, like PostgREST
const db = new pg.Client({ connectionString: url });
await db.connect();
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
  const params = [...new URLSearchParams((qs || '').replace(/\+/g, '%2B'))].map(([k, v]) => [k, encodeURIComponent(v)]);
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

console.log('\nStaff sign in');
let r = await call('/api/staff/code', 'POST', { email: 'stranger@example.com' });
ok('stranger gets the same answer', r.status === 200 && /If that email/.test(r.d.message));
ok('stranger gets no code', !otpSent.includes('stranger@example.com'));
r = await call('/api/staff/code', 'POST', { email: 'info@arizonapetwaste.com' });
ok('owner gets a code', otpSent.includes('info@arizonapetwaste.com'));
r = await call('/api/staff/verify', 'POST', { email: 'info@arizonapetwaste.com', code: '000000' });
ok('wrong code refused', r.status === 400);
r = await call('/api/staff/verify', 'POST', { email: 'info@arizonapetwaste.com', code: '123456' });
ok('owner signs in', r.status === 200 && r.d.staff.role === 'owner', r.d);
const owner = r.d.session.access_token;
codes['customer@example.com'] = '123456';
r = await call('/api/staff/verify', 'POST', { email: 'customer@example.com', code: '123456' });
ok('a customer cannot get in', r.status === 403);
r = await call('/api/office/day', 'GET', null, null);
ok('office needs sign in', r.status === 401);

console.log('\nTeam and areas');
r = await call('/api/office/team', 'POST', { name: 'Maria Lopez', email: 'maria@example.com', phone: '623-555-0101', role: 'scooper' }, owner);
ok('owner adds a scooper', r.status === 200 && r.d.team.some((t) => t.email === 'maria@example.com'), r.d);
const maria = r.d.team.find((t) => t.email === 'maria@example.com');
r = await call('/api/office/area', 'POST', { area: 'buckeye', day: wd }, owner);
ok('set Buckeye service day', r.status === 200 && r.d.areas.find((a) => a.area === 'buckeye').day === wd, r.d);

console.log('\nA website sign up lands in the CRM');
const cid = await authUser('sam@example.com');
await db.query(`insert into public.customers (id, email, name, phone, address, zip, area, plan, dogs, status, texts_visit) values ($1,'sam@example.com','Sam Rivera','6235550100','123 W Test St','85396','buckeye','week',2,'checkout',true)`, [cid]);
const evt = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: cid, subscription: null, customer: 'cus_1' } } });
const t = Math.floor(Date.now() / 1000);
env.STRIPE_WEBHOOK_SECRET = 'whsec_test'; env.STRIPE_SECRET_KEY = 'sk_test_1'; env.STRIPE_PUBLISHABLE_KEY = 'pk_test_1';
const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + evt).digest('hex');
await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt, headers: { 'stripe-signature': 't=' + t + ',v1=' + sig } }), env, ctx);
await Promise.all(waits);
let c = (await db.query('select * from public.customers where id = $1', [cid])).rows[0];
ok('status trialing, pinned on the map, area day set', c.status === 'trialing' && c.lat && c.service_day === wd, { status: c.status, lat: c.lat, day: c.service_day });
const cid2 = await authUser('pat@example.com');
await db.query(`insert into public.customers (id, email, name, phone, address, zip, area, plan, dogs, status, texts_visit, service_day, scooper_id, stop_order, lat, lng) values ($1,'pat@example.com','Pat Lee','6235550111','9 N Second Ave','85396','buckeye','eow',3,'active',false,$2,$3,1,33.5,-112.56)`, [cid2, wd, maria.id]);
await db.query(`update public.customers set eow_week = $1 where id = $2`, [((Math.floor((Date.parse(today + 'T19:00:00Z') - Date.parse('2026-01-05T19:00:00Z')) / (7 * 864e5)) % 2) + 2) % 2, cid2]);

console.log('\nLeads');
r = await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '(623) 555-0122', address: '1 W Main St', zip: '85301', texts: true });
ok('waitlist ok', r.status === 200, r.d);
r = await call('/api/office/leads', 'GET', null, owner);
ok('waitlist shows in leads', r.d.leads.some((l) => l.name === 'Wendy Wait' && l.kind === 'waitlist'));
r = await call('/api/office/lead', 'POST', { kind: 'commercial', name: 'Verrado HOA', phone: '6235550133', details: '12 pet stations' }, owner);
const hoa = r.d.leads.find((l) => l.name === 'Verrado HOA');
r = await call('/api/office/lead', 'POST', { id: hoa.id, status: 'quoted', notes: 'Sent $ quote' }, owner);
ok('lead moves to quoted', r.d.leads.find((l) => l.id === hoa.id).status === 'quoted');

console.log('\nPlan today');
r = await call('/api/office/plan', 'POST', { date: today }, owner);
ok('routes built', r.status === 200 && r.d.added === 2, r.d);
r = await call('/api/office/plan', 'POST', { date: today }, owner);
ok('pressing again adds nothing', r.d.added === 0, r.d);
r = await call('/api/office/day?date=' + today, 'GET', null, owner);
ok('both yards on Maria\'s route', r.d.routes.length === 1 && r.d.stops.length === 2 && r.d.routes[0].staff.name === 'Maria Lopez', { routes: r.d.routes.length, stops: r.d.stops.length });
ok('needs-a-day list empty', r.d.needDay.length === 0);
const stops = r.d.stops;
const samStop = stops.find((s) => s.customer.id === cid), patStop = stops.find((s) => s.customer.id === cid2);
ok('Pat (stop order 1) first', stops[0].customer.id === cid2);
r = await call('/api/office/stop', 'POST', { id: samStop.id, action: 'up' }, owner);
ok('move Sam up', r.d.stops[0].customer.id === cid, r.d.stops.map((s) => s.customer.name));

console.log('\nCrew');
codes['maria@example.com'] = '123456';
r = await call('/api/staff/code', 'POST', { email: 'maria@example.com' });
r = await call('/api/staff/verify', 'POST', { email: 'maria@example.com', code: '123456' });
const mt = r.d.session.access_token;
ok('Maria signs in as scooper', r.d.staff.role === 'scooper');
r = await call('/api/office/day', 'GET', null, mt);
ok('scooper cannot open the office', r.status === 403);
r = await call('/api/crew/today', 'GET', null, mt);
ok('Maria sees 2 stops with gate fields', r.d.stops.length === 2 && 'gate_code' in r.d.stops[0].customer, r.d.stops.map((s) => s.status));
r = await call('/api/track/' + samStop.code, 'GET');
ok('truck link before start: on the route', r.status === 200 && r.d.status === 'scheduled' && r.d.stopsAway === 1 && r.d.scooper === 'Maria', r.d);
r = await call('/api/crew/start', 'POST', {}, mt);
ok('first start asks for location consent', r.status === 428 && r.d.code === 'location_consent', r.d);
r = await call('/api/crew/start', 'POST', { locationOk: true }, mt);
ok('start route: first stop on the way', r.d.route.status === 'live' && r.d.stops[0].status === 'on_the_way');
ok('on the way text queued for Sam (opted in)', r.d.texts.some((x) => x.kind === 'on_the_way' && /arizonapetwaste\.com\/t\//.test(x.body)), r.d.texts);
r = await call('/api/crew/ping', 'POST', { lat: 33.47, lng: -112.53, accuracy: 8 }, mt);
ok('GPS ping saved', r.d.ok === true);
r = await call('/api/track/' + samStop.code, 'GET');
ok('truck link: on the way with miles and arrival time', r.d.status === 'on_the_way' && r.d.miles > 0 && r.d.eta, r.d);
ok('no map keys: no map data', r.d.mapsKey === undefined && r.d.polyline === undefined);
env.GOOGLE_MAPS_BROWSER_KEY = 'browser_key_test'; env.GOOGLE_MAPS_SERVER_KEY = 'server_key_test';
r = await call('/api/track/' + samStop.code, 'GET');
ok('with map keys: truck, home, road route, traffic arrival', r.d.mapsKey === 'browser_key_test' && r.d.truck && r.d.home && r.d.polyline && r.d.miles === 1.6 && routesCalls === 1, r.d);
r = await call('/api/track/' + samStop.code, 'GET');
ok('road route cached for 60 seconds, same miles', routesCalls === 1 && r.d.polyline && r.d.miles === 1.6, { routesCalls, miles: r.d.miles });
r = await call('/api/track/' + patStop.code, 'GET');
ok('next customer sees no truck and no map', r.d.truck === undefined && r.d.mapsKey === undefined, r.d);
delete env.GOOGLE_MAPS_BROWSER_KEY; delete env.GOOGLE_MAPS_SERVER_KEY;
r = await call('/api/track/' + patStop.code, 'GET');
ok('next customer sees stops away, no truck', r.d.status === 'scheduled' && r.d.stopsAway === 2 && r.d.miles === undefined, r.d);
r = await call('/api/crew/done', 'POST', { stopId: samStop.id }, mt);
ok('done without photo refused', r.status === 400 && /photo/.test(r.d.error), r);
r = await call('/api/crew/arrive', 'POST', { stopId: samStop.id }, mt);
ok('arrived', r.d.stops.find((s) => s.id === samStop.id).status === 'here');
const jpg = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg bytes').toString('base64');
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg }, mt);
ok('gate photo saved to private bucket', r.status === 200 && Object.keys(files).some((k) => k.startsWith('gate-photos/')), r.d);
r = await call('/api/crew/done', 'POST', { stopId: samStop.id, note: 'Gate sticks' }, mt);
const after = r.d.stops;
ok('done, next stop on the way', after.find((s) => s.id === samStop.id).status === 'done' && after.find((s) => s.id === patStop.id).status === 'on_the_way');
ok('done text queued for Sam, none for Pat (no texts)', r.d.texts.some((x) => x.kind === 'done') && !r.d.texts.some((x) => x.stop_id === patStop.id), r.d.texts.map((x) => x.kind));
r = await call('/api/track/' + samStop.code, 'GET');
ok('truck link: done with gate photo link', r.d.status === 'done' && /\/storage\/v1\/object\/sign\/gate-photos\//.test(r.d.photo || ''), r.d);
r = await call('/api/crew/cant', 'POST', { stopId: patStop.id, reason: 'gate_locked', note: 'Padlock' }, mt);
ok('can\'t service recorded', r.d.stops.find((s) => s.id === patStop.id).status === 'cant');
r = await call('/api/crew/end', 'POST', {}, mt);
ok('route closed', r.d.route.status === 'done');

console.log('\nTexts and office');
r = await call('/api/office/texts', 'GET', null, owner);
ok('two texts waiting for the business phone', r.d.texts.length === 2 && r.d.twilio === false, r.d.texts.map((x) => x.kind));
r = await call('/api/office/text', 'POST', { id: r.d.texts[0].id, status: 'sent' }, owner);
r = await call('/api/office/texts', 'GET', null, owner);
ok('mark sent', r.d.texts.length === 1);
r = await call('/api/office/customer?id=' + cid, 'GET', null, owner);
ok('customer page shows visit and texts', r.d.visits.length === 1 && r.d.texts.length === 2 && r.d.monthly === 10800, { v: r.d.visits.length, t: r.d.texts.length, m: r.d.monthly });
r = await call('/api/office/customer', 'POST', { id: cid, gate_code: '4471#', pause_from: '2026-12-20', pause_until: '2027-01-03', office_notes: 'Side gate' }, owner);
ok('office saves gate code and pause', r.d.customer.gate_code === '4471#' && r.d.customer.pause_from === '2026-12-20');
r = await call('/api/office/customers?show=current&q=rivera', 'GET', null, owner);
ok('search by name', r.d.customers.length === 1 && r.d.customers[0].name === 'Sam Rivera', r.d);
r = await call('/api/office/money', 'GET', null, owner);
ok('money: 1 paying, 1 free month', r.d.paying.count === 1 && r.d.freeMonth.count === 1, r.d);
r = await call('/api/office/night-before', 'POST', {}, owner);
ok('night before runs', r.status === 200 && 'queued' in r.d, r.d);
r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': 'nope' });
ok('night before refuses a bad secret', r.status === 401);
r = await call('/api/office/photo?stop=' + samStop.id, 'GET', null, owner);
ok('office photo link', /gate-photos/.test(r.d.url || ''));
r = await call('/api/office/stop', 'POST', { id: patStop.id, action: 'skip' }, owner);
ok('cannot skip a finished stop', r.status === 400);

console.log('\nMove a stop ends the old link');
const tom = new Date(Date.parse(today + 'T19:00:00Z') + 7 * 864e5).toISOString().slice(0, 10);
await call('/api/office/plan', 'POST', { date: tom }, owner);
r = await call('/api/office/day?date=' + tom, 'GET', null, owner);
const st1 = r.d.stops[0];
r = await call('/api/office/team', 'POST', { name: 'James Ortiz', email: 'james@example.com', role: 'scooper' }, owner);
const james = r.d.team.find((x) => x.email === 'james@example.com');
r = await call('/api/office/stop', 'POST', { id: st1.id, action: 'move', staffId: james.id }, owner);
const moved = r.d.stops.find((s) => s.id === st1.id);
ok('moved to James with a new link', moved && moved.code !== st1.code && r.d.routes.some((x) => x.staff.name === 'James Ortiz'));
r = await call('/api/track/' + st1.code, 'GET');
ok('old link is dead', r.status === 404);

console.log('\nCancel takes them off future routes');
const evt2 = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', metadata: { user_id: cid } } } });
const sig2 = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + evt2).digest('hex');
await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt2, headers: { 'stripe-signature': 't=' + t + ',v1=' + sig2 } }), env, ctx);
const left = (await db.query(`select count(*)::int n from public.stops where customer_id = $1 and day > $2`, [cid, today])).rows[0].n;
ok('future stops removed after cancel', left === 0, left);

console.log('\nMy Yard visits');
users['cust_tok'] = { id: cid, email: 'sam@example.com' };
r = await call('/api/me/visits', 'GET', null, 'cust_tok');
ok('customer sees their visit with photo', r.d.visits.length === 1 && r.d.visits[0].photo, r.d);

console.log('\n' + pass + ' passed, ' + failN + ' failed');
await db.end();
globalThis.fetch = realFetch;
process.exit(failN ? 1 : 0);

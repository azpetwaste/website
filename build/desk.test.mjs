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
// OLD_DB=1: the database as it is before supabase/patch-2026-11-21.sql is run. The new code must still run on it:
// nothing breaks, nobody has a time, so no day, night before or "on our way" text is made. The texts block is skipped.
const OLD = process.env.OLD_DB === '1';
if (OLD) await db.query(`alter table public.customers drop column if exists service_time, drop column if exists service_time2, drop column if exists texts_stopped_at;
  alter table public.stops drop column if exists visit_time;
  alter table public.messages drop column if exists provider_id, drop column if exists error, drop column if exists delivered_at;`);

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
const TW = { sent: [], refused: [], fail: 0, seen: {} }; // the pretend Twilio: every text it took, the ones it refused, and a code to refuse the next one with
async function authUser(email) {
  const r = await db.query('select id from auth.users where email = $1', [email]);
  if (r.rows[0]) return r.rows[0].id;
  return (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
}
const reply = (data, status = 200) => new Response(data == null ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const realFetch = globalThis.fetch;
const mailBodies = [];
let failUploads = 0;
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
  if (u.startsWith(SB + '/storage/v1/object/sign/')) { const k = u.split('/object/sign/')[1]; return files[k] != null ? reply({ signedURL: '/object/sign/' + k + '?token=x' }) : reply({ error: 'Object not found' }, 404); }
  if (u.startsWith(SB + '/storage/v1/object/')) { if (failUploads > 0) { failUploads--; return reply({ error: 'storage is down' }, 500); } files[u.split('/object/')[1]] = init.body.length; return reply({ Key: 'ok' }); }
  if (u === 'https://routes.googleapis.com/directions/v2:computeRoutes') { routesCalls++; return reply({ routes: [{ duration: '420s', distanceMeters: 2500, polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }); }
  if (u.startsWith('https://geocoding.geo.census.gov/')) return reply({ result: { addressMatches: [{ coordinates: { x: -112.5501, y: 33.4801 } }] } });
  if (u.startsWith('https://api.resend.com/')) { mailBodies.push(String(init.body || '')); return reply({ id: 'm1' }); }
  if (u.startsWith('https://api.twilio.com/2010-04-01/Accounts/')) {
    const f = new URLSearchParams(String(init.body || ''));
    const call = { to: f.get('To'), body: f.get('Body'), service: f.get('MessagingServiceSid'), callback: f.get('StatusCallback'), auth: String((init.headers || {}).authorization || ''), account: u.split('/Accounts/')[1].split('/')[0] };
    if (TW.fail) { const code = TW.fail; TW.fail = 0; TW.refused.push(call); return reply({ code, message: 'refused' }, 400); }
    call.sid = 'SM' + String(TW.sent.length + 1).padStart(32, '0');
    TW.sent.push(call);
    return reply({ sid: call.sid, status: 'accepted' }, 201);
  }
  if (u.startsWith(SB + '/auth/v1/admin/users/')) { const id = u.split('/users/')[1]; return reply({ id, last_sign_in_at: TW.seen[id] || null }); }
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
// The card form saves a card, then the server starts the plan. Stripe's "plan created" event is what books the row here.
const evt = JSON.stringify({ type: 'customer.subscription.created', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'trialing', metadata: { user_id: cid } } } });
const t = Math.floor(Date.now() / 1000);
env.STRIPE_WEBHOOK_SECRET = 'whsec_test'; env.STRIPE_SECRET_KEY = 'sk_test_1'; env.STRIPE_PUBLISHABLE_KEY = 'pk_test_1';
const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + evt).digest('hex');
await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt, headers: { 'stripe-signature': 't=' + t + ',v1=' + sig } }), env, ctx);
await Promise.all(waits);
let c = (await db.query('select * from public.customers where id = $1', [cid])).rows[0];
ok('status trialing, pinned on the map, area day set', c.status === 'trialing' && c.lat && c.service_day === wd, { status: c.status, lat: c.lat, day: c.service_day });
// Joe, Nov 21, 2026: a sign up tells the customer no day. They hear their day and time when the office sets both.
ok('the sign up put the yard on a day and told the customer nothing about it: no day email, no day text', !mailBodies.some((x) => /Your service day is/.test(x)) && (await db.query(`select 1 from public.messages where customer_id = $1 and kind = 'day_set'`, [cid])).rows.length === 0);
if (!OLD) await db.query(`update public.customers set service_time = '09:00' where id = $1`, [cid]);
const cid2 = await authUser('pat@example.com');
await db.query(`insert into public.customers (id, email, name, phone, address, zip, area, plan, dogs, status, texts_visit, service_day, scooper_id, stop_order, lat, lng) values ($1,'pat@example.com','Pat Lee','6235550111','9 N Second Ave','85396','buckeye','eow',3,'active',false,$2,$3,1,33.5,-112.56)`, [cid2, wd, maria.id]);
await db.query(`update public.customers set eow_week = $1 where id = $2`, [((Math.floor((Date.parse(today + 'T19:00:00Z') - Date.parse('2026-01-05T19:00:00Z')) / (7 * 864e5)) % 2) + 2) % 2, cid2]);
if (!OLD) await db.query(`update public.customers set service_time = '09:30' where id = $1`, [cid2]);

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
ok('truck link before start: on the route, with the set time and nothing about the route order', r.status === 200 && r.d.status === 'scheduled' && r.d.stopsAway === undefined && r.d.eta === undefined && r.d.truck === undefined && (OLD || r.d.around === '9:00 AM') && r.d.scooper === 'Maria', r.d);
r = await call('/api/crew/start', 'POST', {}, mt);
ok('first start asks for location consent', r.status === 428 && r.d.code === 'location_consent', r.d);
r = await call('/api/crew/start', 'POST', { locationOk: true }, mt);
ok('start route: first stop on the way', r.d.route.status === 'live' && r.d.stops[0].status === 'on_the_way');
ok(OLD ? 'before the patch nobody has a time, so no on the way text is made' : 'Start route is the tap for the first house: the on the way text is queued for Sam (opted in)', OLD ? !r.d.texts.some((x) => x.kind === 'on_the_way') : r.d.texts.some((x) => x.kind === 'on_the_way' && /arizonapetwaste\.com\/t\//.test(x.body)) && r.d.tap === null, r.d.texts);
// A truck position from before this house was started (taken at another house) is never shown to this customer.
await db.query(`insert into public.positions (route_id, lat, lng, at) select route_id, 33.60, -112.40, now() - interval '3 minutes' from public.stops where id = $1`, [samStop.id]);
r = await call('/api/track/' + samStop.code, 'GET');
ok('the truck link shows no truck from a position older than the tap for this house', r.d.status === 'on_the_way' && r.d.truck === undefined && r.d.miles === undefined, r.d);
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
ok('the next customer sees no truck, no miles, no arrival time and no count of houses before theirs', r.d.status === 'scheduled' && r.d.stopsAway === undefined && r.d.eta === undefined && r.d.miles === undefined && r.d.truck === undefined, r.d);
r = await call('/api/track/DEMO01', 'GET');
ok('demo truck link works with no real visit', r.status === 200 && r.d.demo === true && r.d.scooper === 'Sam' && ['scheduled', 'on_the_way', 'here', 'done'].includes(r.d.status), r.d);
r = await call('/api/log', 'POST', { source: 'crew', path: '/crew route', message: 'Test crash', detail: 'stack' });
ok('crew app crash is logged', r.status === 200);
r = await call('/api/log', 'POST', { source: 'nope', message: 'x' });
r = await call('/api/office/settings', 'GET', null, owner);
ok('yard limit starts at 30, Monday to Friday', r.status === 200 && r.d.cap === 30 && r.d.days === '1,2,3,4,5', r.d);
r = await call('/api/office/settings', 'POST', { cap: 25, days: '1,2,3,4,5,6' }, owner);
ok('office saves 25 yards a day and Saturday', r.d.cap === 25 && r.d.days === '1,2,3,4,5,6', r.d);
r = await call('/api/office/week', 'POST', { mode: 'new' }, owner);
ok('the week plan uses the saved limit', r.status === 200 && r.d.cap === 25, { cap: r.d.cap });
r = await call('/api/office/settings', 'POST', { cap: 30, days: '1,2,3,4,5' }, owner);
r = await call('/api/office/settings', 'POST', { start: '20800 W Eastview Way, Buckeye, AZ 85396' }, owner);
ok('office saves where the truck starts', r.status === 200 && /Eastview/.test(r.d.start || ''), r.d.start);
ok('the start is kept with its map pin', (await db.query("select value from settings where key = 'route_start'")).rows[0]?.value === '33.4801,-112.5501');
r = await call('/api/office/settings', 'GET', null, owner);
ok('the start comes back when the planner opens', /Eastview/.test(r.d.start || '') && r.d.cap === 30, r.d);
r = await call('/api/office/settings', 'POST', { start: '' }, owner);
ok('an empty start clears it', r.status === 200 && r.d.start === '', r.d.start);
r = await call('/api/office/settings', 'POST', { cap: 25 }, mt);
ok('scooper cannot change the yard limit', r.status === 403);
r = await call('/api/office/health', 'GET', null, mt);
ok('scooper cannot open health', r.status === 403);
r = await call('/api/office/health', 'GET', null, owner);
ok('health: checks, live truck, last GPS, one crash', r.status === 200 && r.d.checks.desk === true && r.d.liveRoutes === 1 && r.d.lastPing && r.d.errors.length === 1 && r.d.errors[0].message === 'Test crash', r.d);
r = await call('/api/crew/done', 'POST', { stopId: samStop.id }, mt);
ok('done without photo refused', r.status === 400 && /photo/.test(r.d.error), r);
r = await call('/api/crew/arrive', 'POST', { stopId: samStop.id }, mt);
ok('arrived', r.d.stops.find((s) => s.id === samStop.id).status === 'here');
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // every real JPEG starts with these bytes
const jpg = 'data:image/jpeg;base64,' + Buffer.concat([JPEG, Buffer.from('fake jpeg bytes')]).toString('base64');
// The gate photo is the proof of the visit. These checks are the ones that must never fail.
const photoOf = async () => (await db.query('select photo_path, no_photo from public.stops where id = $1', [samStop.id])).rows[0];
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: 'data:text/html;base64,' + Buffer.from('<b>hi</b>').toString('base64') }, mt);
ok('a file that is not a picture is refused', r.status === 400 && !(await photoOf()).photo_path, r.d);
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: 'data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024 + 10, 1).toString('base64') }, mt);
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: 'data:image/jpeg;base64,' + Buffer.from('<html>not a real picture, only labeled as one</html>').toString('base64') }, mt);
ok('a file labeled as a picture that is not one is refused', r.status === 400 && /not a photo/.test(r.d.error || '') && !(await photoOf()).photo_path, r.d.error);
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: 'data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024 + 10, 1).toString('base64') }, mt);
ok('a photo over 3 MB is refused with a plain message', r.status === 400 && /too big/.test(r.d.error || ''), r.d.error);
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg }, null);
ok('nobody can send a photo without signing in', r.status === 401);
failUploads = 2;
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg }, mt);
ok('storage down twice: the app is told the photo did not save', r.status === 502 && /did not save/.test(r.d.error || ''), r.d);
ok('and the stop is NOT marked as having a photo', !(await photoOf()).photo_path);
r = await call('/api/crew/done', 'POST', { stopId: samStop.id }, mt);
ok('and the yard still cannot be finished without the photo', r.status === 400);
failUploads = 1;
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg }, mt);
ok('storage fails once: the server tries again and the photo saves', r.status === 200 && !!(await photoOf()).photo_path && r.d.bytes > 0, r.d);
await db.query('update public.stops set photo_path = null where id = $1', [samStop.id]);
for (const k of Object.keys(files)) delete files[k];
r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg }, mt);
ok('the saved photo is proven to be in storage before the stop is marked', r.status === 200 && Object.keys(files).some((k) => k.startsWith('gate-photos/')));
ok('gate photo saved to private bucket', r.status === 200 && Object.keys(files).some((k) => k.startsWith('gate-photos/')), r.d);
{
  const row = await photoOf(), big = 'data:image/jpeg;base64,' + Buffer.concat([JPEG, Buffer.alloc(600 * 1024 - 4, 7)]).toString('base64');
  ok('the stop points at the exact file that was saved', files['gate-photos/' + row.photo_path] != null && row.no_photo === false, row.photo_path);
  r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: big }, mt);
  const row2 = await photoOf();
  ok('a retake of a real size photo (600 KB) saves and replaces the link', r.status === 200 && r.d.bytes === 600 * 1024 && row2.photo_path !== row.photo_path && files['gate-photos/' + row2.photo_path] === 600 * 1024, r.d);
  // Time stamps. Every photo carries the time it was taken.
  ok('a photo with no time sent still gets one, from the server clock', /-t\d{10}\.jpg$/.test(row.photo_path) && Math.abs(Date.parse(r.d.photoAt) - Date.now()) < 60e3 && r.d.timeTyped === false, row.photo_path);
  const at1049 = today + 'T10:49:00-07:00', okTime = Date.parse(at1049) <= Date.now();
  const typed = okTime ? at1049 : new Date(Date.now() - 20 * 60e3).toISOString();
  r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg, takenAt: typed, manual: true }, mt);
  const row3 = await photoOf();
  ok('an uploaded photo keeps the time the scooper set, and is marked as typed', r.status === 200 && Date.parse(r.d.photoAt) === Math.floor(Date.parse(typed) / 1000) * 1000 && r.d.timeTyped === true && /-t\d{10}m\.jpg$/.test(row3.photo_path), { photoAt: r.d.photoAt, path: row3.photo_path });
  r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg, takenAt: new Date(Date.now() + 3 * 3600e3).toISOString(), manual: true }, mt);
  ok('a time in the future is not believed: the server clock is used and it is not marked typed', r.status === 200 && Math.abs(Date.parse(r.d.photoAt) - Date.now()) < 60e3 && r.d.timeTyped === false, r.d.photoAt);
  r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg, takenAt: '2020-01-01T10:00:00-07:00', manual: true }, mt);
  ok('a time from another day is not believed either', r.status === 200 && Math.abs(Date.parse(r.d.photoAt) - Date.now()) < 60e3 && r.d.timeTyped === false, r.d.photoAt);
  r = await call('/api/crew/photo', 'POST', { stopId: samStop.id, image: jpg, takenAt: typed, manual: true }, mt);
}
env.RESEND_API_KEY = 're_test'; mailBodies.length = 0;
r = await call('/api/crew/done', 'POST', { stopId: samStop.id, note: 'Gate sticks' }, mt);
const after = r.d.stops;
ok('Sam said yes to visit texts, so no done email (the text carries the photo)', !mailBodies.some((x) => /Your yard is done/.test(x)), mailBodies.length);
ok('done: the next house is NOT started. It waits for its own tap', after.find((s) => s.id === samStop.id).status === 'done' && after.find((s) => s.id === patStop.id).status === 'scheduled' && r.d.tap === patStop.id, { tap: r.d.tap });
ok('done text queued for Sam, none for Pat (no texts)', r.d.texts.some((x) => x.kind === 'done') && !r.d.texts.some((x) => x.stop_id === patStop.id), r.d.texts.map((x) => x.kind));
{ // Between houses: the truck is still pinging, and neither customer's link shows it.
  await call('/api/crew/ping', 'POST', { lat: 33.48, lng: -112.54, accuracy: 8 }, mt);
  env.GOOGLE_MAPS_BROWSER_KEY = 'browser_key_test';
  const a = await call('/api/track/' + samStop.code, 'GET'), b2 = await call('/api/track/' + patStop.code, 'GET');
  delete env.GOOGLE_MAPS_BROWSER_KEY;
  ok('between houses nobody sees the truck: not the customer just done, not the next one', a.d.status === 'done' && a.d.truck === undefined && b2.d.status === 'scheduled' && b2.d.truck === undefined && b2.d.eta === undefined && b2.d.mapsKey === undefined, [a.d, b2.d]);
  const x = await call('/api/crew/onway', 'POST', { stopId: patStop.id }, mt);
  ok('Start next house: that house is on the way, and no text for Pat (no texts)', x.d.stops.find((s) => s.id === patStop.id).status === 'on_the_way' && x.d.tap === null && !x.d.texts.some((t) => t.stop_id === patStop.id));
  const y = await call('/api/crew/onway', 'POST', { stopId: samStop.id }, mt);
  ok('a house that is done cannot be started again', y.status === 200 && y.d.stops.find((s) => s.id === samStop.id).status === 'done');
}
r = await call('/api/track/' + samStop.code, 'GET');
ok('truck link: done with gate photo link', r.d.status === 'done' && /\/storage\/v1\/object\/sign\/gate-photos\//.test(r.d.photo || ''), r.d);
ok('truck link: the customer sees when the photo was taken, and that the time was typed', !!r.d.photoAt && r.d.timeTyped === true, { photoAt: r.d.photoAt, timeTyped: r.d.timeTyped });
{ // A customer who said no to visit texts gets the gate photo link by email instead (Joe, Nov 16, 2026: the photo must always reach them).
  await db.query('update public.customers set texts_visit = false where id = $1', [cid]);
  await db.query("update public.stops set status = 'here' where id = $1", [samStop.id]);
  mailBodies.length = 0;
  r = await call('/api/crew/done', 'POST', { stopId: samStop.id }, mt);
  const m = mailBodies.map((x) => JSON.parse(x)).find((x) => /Your yard is done/.test(x.subject));
  ok('no visit texts: the gate photo link goes by email, once', r.status === 200 && !!m && m.to[0] === 'sam@example.com' && m.text.includes('https://arizonapetwaste.com/t/' + samStop.code) && mailBodies.length === 1, mailBodies);
  const t = await db.query("select count(*)::int as n from public.messages where stop_id = $1 and kind = 'done'", [samStop.id]);
  ok('and no second done text is queued', t.rows[0].n === 1, t.rows);
  await db.query('update public.customers set texts_visit = true where id = $1', [cid]);
  delete env.RESEND_API_KEY;
}
r = await call('/api/crew/cant', 'POST', { stopId: patStop.id, reason: 'gate_locked', note: 'Padlock' }, mt);
ok('can\'t service recorded', r.d.stops.find((s) => s.id === patStop.id).status === 'cant');
r = await call('/api/crew/end', 'POST', {}, mt);
ok('route closed', r.d.route.status === 'done');

console.log('\nTexts and office');
r = await call('/api/office/texts', 'GET', null, owner);
ok('with no Twilio settings the texts wait for the business phone: the done text. The unsent on the way text left the list when the yard was done', r.d.texts.map((x) => x.kind).sort().join() === 'done' && r.d.twilio === false && r.d.test === null, r.d.texts.map((x) => x.kind));
{ const old = await db.query("select status from public.messages where kind = 'on_the_way' and stop_id = $1", [samStop.id]); ok('that on the way text is kept as skipped, not deleted', OLD ? old.rows.length === 0 : old.rows.length === 1 && old.rows[0].status === 'skipped', old.rows); }
for (const x of r.d.texts) await call('/api/office/text', 'POST', { id: x.id, status: 'sent' }, owner);
r = await call('/api/office/texts', 'GET', null, owner);
ok('mark sent: nothing waits, and the log has them', r.d.texts.length === 0 && r.d.log.filter((x) => x.status === 'sent').length >= 1, { waiting: r.d.texts.length, log: r.d.log.length });
r = await call('/api/office/customer?id=' + cid, 'GET', null, owner);
ok('customer page shows visit and texts', r.d.visits.length === 1 && r.d.texts.filter((x) => x.kind === 'done' || x.kind === 'on_the_way').length === (OLD ? 1 : 2) && r.d.monthly === 9900, { v: r.d.visits.length, t: r.d.texts.length, m: r.d.monthly });
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

console.log('\nOffice uploads a gate photo by hand (the backup when the app was down)');
{
  // A visit for today that the app never finished: the scooper was there, the app was down.
  await db.query(`update public.stops set status = 'scheduled', done_at = null, photo_path = null, no_photo = false
    where id = (select id from public.stops where day = $1 and status <> 'skipped' order by (status = 'done') desc, id desc limit 1)`, [today]);
  r = await call('/api/office/day?date=' + today, 'GET', null, owner);
  const open = r.d.stops.find((x) => ['scheduled', 'on_the_way', 'here'].includes(x.status));
  if (!open) ok('there is an open visit today to test with', false);
  else {
    const at = new Date(Date.now() - 20 * 60e3).toISOString();
    r = await call('/api/office/photo', 'POST', { stopId: open.id, image: jpg, takenAt: at, manual: true }, mt);
    ok('a scooper cannot use the office upload', r.status === 403);
    r = await call('/api/office/photo', 'POST', { stopId: open.id, image: 'data:image/jpeg;base64,AAAA', takenAt: at }, owner);
    ok('the office upload refuses a file that is not a picture', r.status === 400);
    r = await call('/api/office/photo', 'POST', { stopId: open.id, image: jpg, takenAt: at, manual: true }, owner);
    const row = (await db.query('select status, done_at, photo_path, no_photo from public.stops where id = $1', [open.id])).rows[0];
    ok('the office uploads a photo for a visit the app never finished', r.status === 200 && !!row.photo_path && row.no_photo === false && files['gate-photos/' + row.photo_path] != null, row.photo_path);
    ok('that visit is marked done at the time on the photo', row.status === 'done' && Math.abs(new Date(row.done_at) - Math.floor(Date.parse(at) / 1000) * 1000) < 1000, row.done_at);
    r = await call('/api/office/photo?stop=' + open.id, 'GET', null, owner);
    ok('the office sees the photo time and that it was typed', !!r.d.url && r.d.timeTyped === true && Date.parse(r.d.photoAt) === Math.floor(Date.parse(at) / 1000) * 1000, r.d.photoAt);
  }
  const old = (await db.query(`insert into public.stops (route_id, customer_id, day, code) select route_id, customer_id, $1, 'OLD999' from public.stops limit 1 returning id`, [new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)])).rows[0];
  r = await call('/api/office/photo', 'POST', { stopId: old.id, image: jpg }, owner);
  ok('a visit older than 14 days cannot get a photo added', r.status === 400, r.d.error);
  await db.query('delete from public.stops where id = $1', [old.id]);
}

console.log('\nA yard marked Not done: the note, going back, and the office finishing it (Joe, Nov 23, 2026)');
{
  // Pat's yard was marked "can't" above and the route was ended. Everything here is put back at the end.
  const was = (await db.query('select * from public.stops where id = $1', [patStop.id])).rows[0];
  const routeWas = (await db.query('select status, ended_at from public.routes where id = $1', [was.route_id])).rows[0];
  const msgWas = (await db.query('select coalesce(max(id), 0)::int as n from public.messages')).rows[0].n;
  const mailsWas = mailBodies.length;
  const row = async () => (await db.query('select status, reason, note, done_at, photo_path, no_photo from public.stops where id = $1', [patStop.id])).rows[0];
  const doneTexts = async () => (await db.query("select count(*)::int as n from public.messages where stop_id = $1 and kind = 'done' and channel = 'sms'", [patStop.id])).rows[0].n;
  await db.query('update public.customers set texts_visit = true where id = $1', [was.customer_id]); // Pat said yes to visit texts for this part
  ok('the test starts from a yard marked Not done on today\'s route', was.status === 'cant' && was.day === today, { status: was.status, day: was.day });

  // The note
  r = await call('/api/crew/note', 'POST', { stopId: patStop.id, note: 'Gate was open after all. Two dogs out back.' }, mt);
  ok('the scooper changes his note on a finished yard', r.status === 200 && r.d.stops.find((x) => x.id === patStop.id).note === 'Gate was open after all. Two dogs out back.' && (await row()).status === 'cant', r.d.error);
  r = await call('/api/crew/note', 'POST', { stopId: patStop.id, note: '   ' }, mt);
  ok('an empty note takes the note off', r.status === 200 && (await row()).note === null);
  r = await call('/api/crew/note', 'POST', { stopId: 99999999, note: 'x' }, mt);
  ok('a note on a yard that is not his is refused', r.status === 404);
  r = await call('/api/office/stop', 'POST', { id: patStop.id, action: 'note', note: 'Office note' }, owner);
  ok('the office changes the note from the Schedule', r.status === 200 && (await row()).note === 'Office note', r.d.error);

  // The office cannot call a visit done with no gate photo
  r = await call('/api/office/stop', 'POST', { id: patStop.id, action: 'done' }, owner);
  ok('mark done with no gate photo is refused', r.status === 400 && /photo/i.test(r.d.error || '') && (await row()).status === 'cant', r.d.error);

  // Going back from the crew app
  r = await call('/api/crew/reopen', 'POST', { stopId: patStop.id }, mt);
  let now = await row();
  ok('the scooper opens a Not done yard again: it is back at the boxes and the route is live', r.status === 200 && now.status === 'here' && now.reason === null && now.done_at === null && r.d.route.status === 'live', { s: now.status, route: r.d.route && r.d.route.status, e: r.d.error });
  r = await call('/api/crew/reopen', 'POST', { stopId: patStop.id }, mt);
  ok('a yard that is not marked Not done cannot be opened again', r.status === 400);
  {
    // He is standing in another yard: that one is finished first. Driving to another yard does not block going back.
    const other = (await db.query("select id, status from public.stops where route_id = $1 and id <> $2 limit 1", [was.route_id, patStop.id])).rows[0];
    if (other) {
      await db.query("update public.stops set status = 'cant', reason = 'gate_locked', done_at = now() where id = $1", [patStop.id]);
      await db.query("update public.stops set status = 'here' where id = $1", [other.id]);
      r = await call('/api/crew/reopen', 'POST', { stopId: patStop.id }, mt);
      ok('standing in another yard, he is told to finish that one first', r.status === 409, r.d.error);
      await db.query("update public.stops set status = 'on_the_way' where id = $1", [other.id]);
      r = await call('/api/crew/reopen', 'POST', { stopId: patStop.id }, mt);
      ok('driving to another yard, he can still go back to this one', r.status === 200 && (await row()).status === 'here', r.d.error);
      await db.query('update public.stops set status = $2 where id = $1', [other.id, other.status]);
    }
  }
  r = await call('/api/crew/done', 'POST', { stopId: patStop.id }, mt);
  ok('it still cannot be finished with no gate photo', r.status === 400);
  r = await call('/api/crew/photo', 'POST', { stopId: patStop.id, image: jpg, takenAt: new Date().toISOString() }, mt);
  ok('he takes the gate photo', r.status === 200, r.d.error);
  r = await call('/api/crew/done', 'POST', { stopId: patStop.id }, mt);
  now = await row();
  ok('he finishes it: Done, with the photo, and one done text for the customer', r.status === 200 && now.status === 'done' && !!now.photo_path && now.no_photo === false && (await doneTexts()) === 1, { s: now.status, texts: await doneTexts() });

  // The office upload on a Not done visit finishes it and tells the customer
  await db.query("delete from public.messages where stop_id = $1 and kind = 'done'", [patStop.id]);
  await db.query("update public.stops set status = 'cant', reason = 'gate_locked', photo_path = null, done_at = now() where id = $1", [patStop.id]);
  const at = new Date(Date.now() - 10 * 60e3).toISOString();
  r = await call('/api/office/photo', 'POST', { stopId: patStop.id, image: jpg, takenAt: at }, owner);
  now = await row();
  ok('the office uploads the gate photo on a Not done visit: it is Done at the photo time, the reason is gone', r.status === 200 && now.status === 'done' && now.reason === null && !!now.photo_path && Math.abs(new Date(now.done_at) - Math.floor(Date.parse(at) / 1000) * 1000) < 1000, now);
  ok('and the customer gets the done text, once', (await doneTexts()) === 1, await doneTexts());
  r = await call('/api/office/photo', 'POST', { stopId: patStop.id, image: jpg, takenAt: at }, owner);
  ok('a second upload sends no second done text', r.status === 200 && (await doneTexts()) === 1, await doneTexts());

  // Mark done: a Not done visit that already has its photo (the state of the live visit on Nov 23, 2026)
  await db.query("delete from public.messages where stop_id = $1 and kind = 'done'", [patStop.id]);
  await db.query("update public.stops set status = 'cant', reason = 'gate_locked' where id = $1", [patStop.id]);
  r = await call('/api/office/stop', 'POST', { id: patStop.id, action: 'done' }, mt);
  ok('a scooper cannot use the office mark done', r.status === 403);
  r = await call('/api/office/stop', 'POST', { id: patStop.id, action: 'done' }, owner);
  now = await row();
  ok('the office marks it done: Done, and the customer gets the done text', r.status === 200 && now.status === 'done' && now.reason === null && (await doneTexts()) === 1, { s: now.status, texts: await doneTexts(), e: r.d.error });
  r = await call('/api/office/stop', 'POST', { id: patStop.id, action: 'done' }, owner);
  ok('marking it done twice tells nobody twice', r.status === 200 && (await doneTexts()) === 1);
  r = await call('/api/track/' + was.code, 'GET');
  ok('the customer\'s link reads done with the photo', r.status === 200 && r.d.status === 'done' && !!r.d.photo, { s: r.d.status, p: !!r.d.photo });

  // Put everything back for the tests below
  await db.query('delete from public.messages where id > $1', [msgWas]);
  await db.query('update public.stops set status = $2, reason = $3, note = $4, done_at = $5, arrived_at = $6, photo_path = $7, no_photo = $8 where id = $1', [patStop.id, was.status, was.reason, was.note, was.done_at, was.arrived_at, was.photo_path, was.no_photo]);
  await db.query('update public.routes set status = $2, ended_at = $3 where id = $1', [was.route_id, routeWas.status, routeWas.ended_at]);
  await db.query('update public.customers set texts_visit = false where id = $1', [was.customer_id]);
  mailBodies.length = mailsWas;
}

console.log('\nMove a group of yards to another day');
{
  const plus = (d, n) => new Date(Date.parse(d + 'T19:00:00Z') + n * 864e5).toISOString().slice(0, 10), wdOf = (d) => new Date(d + 'T19:00:00Z').getUTCDay();
  const tom2 = plus(tom, 1), tom3 = plus(tom, 2);
  r = await call('/api/office/day?date=' + tom, 'GET', null, owner);
  const group = r.d.stops.filter((x) => x.status === 'scheduled'), custIds = group.map((x) => x.customer.id);
  r = await call('/api/office/loads?from=' + tom + '&staff=' + james.id, 'GET', null, owner);
  ok('the office sees how full the next 7 days are', r.status === 200 && r.d.days.length === 7 && r.d.days[0].day === tom && r.d.days[0].yards >= 1 && r.d.cap === 30, r.d.days.map((x) => x.yards).join(','));
  r = await call('/api/office/loads?from=' + tom + '&staff=' + james.id + '&ids=' + group.map((x) => x.id).join(','), 'GET', null, owner);
  const t2 = r.d.days.find((x) => x.day === tom2);
  ok('before a move the office sees the extra miles and drive time for each day', r.status === 200 && r.d.moving === group.length && t2 && typeof t2.addMiles === 'number' && typeof t2.addMinutes === 'number' && r.d.saves && typeof r.d.saves.miles === 'number', { add: t2 && t2.addMiles, saves: r.d.saves, best: r.d.best });
  ok('it names the day that fits best', r.d.best == null || r.d.days.some((x) => x.day === r.d.best && x.works));
  r = await call('/api/office/move-day', 'POST', { ids: group.map((x) => x.id), to: tom2 }, mt);
  ok('a scooper cannot move yards between days', r.status === 403);
  r = await call('/api/office/move-day', 'POST', { ids: group.map((x) => x.id), to: tom2 }, owner);
  ok('a group of yards moves to the next day in one go', r.status === 200 && r.d.moved === group.length && r.d.toYards >= group.length && r.d.over === false, { moved: r.d.moved, toYards: r.d.toYards });
  ok('the old day shows them as moved, not as open visits', r.d.day.stops.filter((x) => custIds.includes(x.customer.id)).every((x) => x.status === 'skipped' && /^Moved to /.test(x.note || '')));
  r = await call('/api/office/day?date=' + tom2, 'GET', null, owner);
  const landed = r.d.stops.filter((x) => custIds.includes(x.customer.id));
  ok('the new day has them, ready and numbered', landed.length === group.length && landed.every((x) => x.status === 'scheduled' && x.position < 9000), landed.map((x) => x.position));
  ok('each moved visit has a new link', landed.every((x) => !group.some((g) => g.code === x.code)));
  r = await call('/api/office/plan', 'POST', { date: tom }, owner);
  ok('building the old day again does not put them back', r.d.added === 0, r.d.added);
  let rows = (await db.query('select service_day from customers where id = any($1)', [custIds])).rows;
  ok('just this visit: the regular day did not change', rows.every((x) => x.service_day === wdOf(tom)), rows.map((x) => x.service_day));
  r = await call('/api/office/move-day', 'POST', { ids: landed.map((x) => x.id), to: tom3, forever: true }, owner);
  rows = (await db.query('select service_day from customers where id = any($1)', [custIds])).rows;
  ok('every week from now on: the regular day changes', r.status === 200 && r.d.moved === landed.length && rows.every((x) => x.service_day === wdOf(tom3)), rows.map((x) => x.service_day));
  ok('the customer gets an email with the new day' + (env.RESEND_API_KEY ? '' : ' (mail is off in this test, so none is sent)'), env.RESEND_API_KEY ? mailBodies.some((x) => /Your new service day is /.test(x)) : true);
  r = await call('/api/office/move-day', 'POST', { ids: landed.map((x) => x.id), to: plus(today, -1) }, owner);
  ok('yards cannot move to a day in the past', r.status === 400);
  r = await call('/api/office/move-day', 'POST', { ids: [], to: tom3 }, owner);
  ok('nothing picked is refused', r.status === 400);
}

console.log('\nCancel takes them off future routes');
const evt2 = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', metadata: { user_id: cid } } } });
const sig2 = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + evt2).digest('hex');
await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt2, headers: { 'stripe-signature': 't=' + t + ',v1=' + sig2 } }), env, ctx);
const left = (await db.query(`select count(*)::int n from public.stops where customer_id = $1 and day > $2`, [cid, today])).rows[0].n;
ok('future stops removed after cancel', left === 0, left);

console.log('\nShort truck link loads the /t/ page');
let asked = null;
env.ASSETS = { fetch: async (req) => { asked = new URL(req.url).pathname; return new Response('truck page', { status: 200 }); } };
const pageRes = await worker.fetch(new Request('https://arizonapetwaste.com/t/' + samStop.code), env, ctx);
ok('/t/CODE serves /t/ with noindex', pageRes.status === 200 && asked === '/t/' && /noindex/.test(pageRes.headers.get('x-robots-tag') || ''), { status: pageRes.status, asked });

console.log('\nMy Yard visits');
users['cust_tok'] = { id: cid, email: 'sam@example.com' };
r = await call('/api/me/visits', 'GET', null, 'cust_tok');
ok('customer sees their visit with photo', r.d.visits.length === 1 && r.d.visits[0].photo, r.d);

console.log('\nA brake on guessing and floods');
{
  const hit = async (p, ip, body) => (await worker.fetch(new Request('https://arizonapetwaste.com' + p, { method: body ? 'POST' : 'GET', headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, ctx)).status;
  const codes = []; for (let i = 0; i < 12; i++) codes.push(await hit('/api/staff/verify', '203.0.113.9', { email: 'x@example.com', token: '000000' }));
  ok('guessing sign in codes is cut off after 10 tries from one address', codes.slice(0, 10).every((x) => x !== 429) && codes[10] === 429 && codes[11] === 429, codes.join(','));
  ok('another address is not blocked by that', (await hit('/api/staff/verify', '203.0.113.10', { email: 'x@example.com', token: '000000' })) !== 429);
  const tr = []; for (let i = 0; i < 125; i++) tr.push(await hit('/api/track/ZZZZZ' + (i % 9), '203.0.113.11'));
  ok('guessing truck link codes is cut off after 120 a minute', tr[119] === 404 && tr[120] === 429, tr.slice(118, 122).join(','));
}

console.log('\nThe sign in lock, the size cap and the second lock on the tables (Nov 16, 2026)');
{
  const from = async (ip, p, body, token) => { const r = await worker.fetch(new Request('https://arizonapetwaste.com' + p, { method: 'POST', headers: Object.assign({ 'cf-connecting-ip': ip, 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) }), env, ctx); let d = null; try { d = await r.json(); } catch (e) { } return { status: r.status, d }; };
  const mail = 'info@arizonapetwaste.com';
  await db.query('delete from public.auth_tries');
  codes[mail] = '123456';
  // Wrong codes for one staff email, each from a different visitor address, so the per address brake never trips.
  const tries = []; for (let i = 0; i < 5; i++) tries.push((await from('198.51.100.' + (10 + i), '/api/staff/verify', { email: mail, code: '00000' + i })).status);
  ok('five wrong codes for a staff email are each just refused', tries.every((x) => x === 400), tries.join(','));
  let x = await from('198.51.100.77', '/api/staff/verify', { email: mail, code: '123456' });
  ok('the sixth try is locked out, from a new address and even with the right code', x.status === 429 && /Too many wrong codes/.test(x.d.error), x);
  ok('the lock is kept in the database, one row for each try', (await db.query("select count(*)::int n from public.auth_tries where email = $1 and kind = 'try'", [mail])).rows[0].n === 6);
  x = await from('198.51.100.78', '/api/staff/verify', { email: 'maria@example.com', code: '000000' });
  ok('another staff email is not locked by that', x.status === 400, x.status);
  await db.query("update public.auth_tries set at = at - interval '16 minutes'");
  x = await from('198.51.100.79', '/api/staff/verify', { email: mail, code: '123456' });
  ok('after 15 minutes the right code works again', x.status === 200 && x.d.staff.role === 'owner', x.status);
  ok('a good sign in clears the count', (await db.query("select count(*)::int n from public.auth_tries where email = $1 and kind = 'try'", [mail])).rows[0].n === 0);
  codes['customer@example.com'] = '123456';
  x = await from('198.51.100.80', '/api/staff/verify', { email: 'customer@example.com', code: '123456' });
  ok('a customer still cannot get in, and no lock row is written for them', x.status === 403 && (await db.query("select count(*)::int n from public.auth_tries where email = 'customer@example.com'")).rows[0].n === 0, x.status);

  // A flood of "email me a code" for one staff email.
  await db.query('delete from public.auth_tries');
  const before = otpSent.filter((e) => e === mail).length, asks = [];
  for (let i = 0; i < 6; i++) asks.push((await from('198.51.100.' + (120 + i), '/api/staff/code', { email: mail })).d.message);
  ok('code emails for one staff email stop at 3 in 15 minutes', otpSent.filter((e) => e === mail).length - before === 3, otpSent.filter((e) => e === mail).length - before);
  ok('the answer stays the same, so the page never says who is on the team or who is locked', asks.every((m) => m === asks[0]));
  await db.query('delete from public.auth_tries');

  // Too much to send at once.
  const big = JSON.stringify({ name: 'x'.repeat(200000), phone: '6235550100', address: '1 Main St', zip: '85326' });
  let r2 = await worker.fetch(new Request('https://arizonapetwaste.com/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(big.length), 'cf-connecting-ip': '198.51.100.90' }, body: big }), env, ctx);
  ok('a 200 KB form post is turned away by its stated size', r2.status === 413, r2.status);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const leads0 = (await db.query('select count(*)::int n from public.leads')).rows[0].n;
  r2 = await worker.fetch(new Request('https://arizonapetwaste.com/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.91' }, body: stream, duplex: 'half' }), env, ctx);
  ok('with the size left off it is still not read: nothing is saved', r2.status === 400 && (await db.query('select count(*)::int n from public.leads')).rows[0].n === leads0, r2.status);
  const tiny = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(2500000, 7)]).toString('base64');
  r2 = await call('/api/crew/photo', 'POST', { stopId: 999999, image: tiny }, owner);
  ok('a real size gate photo (2.5 MB) still gets past the size cap', r2.status === 404, r2.status);

  // Staff sign in by emailed code only. A session that came from a password is never staff.
  const jwt = (claims) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.sig';
  const pw = jwt({ sub: users[owner].id, amr: [{ method: 'password', timestamp: 1 }] }), otp = jwt({ sub: users[owner].id, amr: [{ method: 'otp', timestamp: 1 }, { method: 'token_refresh', timestamp: 2 }] });
  users[pw] = users[owner]; users[otp] = users[owner];
  ok('a password session for the owner\'s email is refused', (await call('/api/office/day', 'GET', null, pw)).status === 401);
  users[jwt({ sub: cid, amr: [{ method: 'password' }] })] = { id: cid, email: 'sam@example.com' };
  ok('a password session is refused on My Yard too', (await call('/api/me', 'GET', null, jwt({ sub: cid, amr: [{ method: 'password' }] }))).status === 401);
  ok('an emailed code session, refreshed, is let in', (await call('/api/office/day', 'GET', null, otp)).status === 200);
  delete users[pw]; delete users[otp];

  // The second lock: table rights.
  const grants = (await db.query("select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2")).rows;
  ok('the public keys hold one table right in all: signed in customers may read customers (their own row, by policy)', grants.length === 1 && grants[0].table_name === 'customers' && grants[0].privilege_type === 'SELECT', grants);
  const open = (await db.query("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")).rows;
  ok('every table has row level security on', open.length === 0, open);
  await db.query('create table public.zz_new_table (id int)');
  const fresh = (await db.query("select count(*)::int n from information_schema.role_table_grants where table_schema = 'public' and table_name = 'zz_new_table' and grantee in ('anon', 'authenticated')")).rows[0].n;
  await db.query('drop table public.zz_new_table');
  ok('a table added later starts closed to the public keys', fresh === 0, fresh);
  // Before the patch is run on the live database the table is not there. Sign in must still work, with a lock kept in memory.
  await db.query('alter table public.auth_tries rename to auth_tries_off');
  const quiet = console.log; console.log = () => {}; // the stand in prints each refused read, and there are a few here
  const off = []; for (let i = 0; i < 6; i++) off.push((await from('198.51.100.' + (140 + i), '/api/staff/verify', { email: 'maria@example.com', code: '00000' + i })).status);
  codes[mail] = '123456';
  const stillIn = await from('198.51.100.150', '/api/staff/verify', { email: mail, code: '123456' });
  const hOff = await call('/api/office/health', 'GET', null, owner);
  console.log = quiet;
  await db.query('alter table public.auth_tries_off rename to auth_tries');
  ok('with the lock table missing, wrong codes are still cut off after five', off.slice(0, 5).every((x) => x === 400) && off[5] === 429, off.join(','));
  ok('with the lock table missing, staff can still sign in', stillIn.status === 200, stillIn.status);
  ok('and the Health tab says the lock is off', hOff.d.checks.signLock === false, hOff.d.checks);
  const patch = fs.readFileSync(path.join(ROOT, 'supabase/patch-2026-11-16.sql'), 'utf8');
  await db.query(patch); await db.query(patch);
  ok('the patch file runs clean, twice, and leaves the same single table right', (await db.query("select count(*)::int n from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')")).rows[0].n === 1);
  const hl = await call('/api/office/health', 'GET', null, owner);
  ok('the Health tab says the sign in lock is on', hl.d.checks.signLock === true && hl.d.checks.botCheck === false, hl.d.checks);
}


console.log('\nNov 18, 2026: an owner who scoops, how fast a lead was reached, a Health list that clears, Money in plain lists');
{
  let t = await call('/api/office/team', 'GET', null, owner);
  const boss = t.d.team.find((x) => x.email === 'info@arizonapetwaste.com');
  ok('the Team list says who runs a route and who has signed in, and holds no sign in id', boss && boss.scoops === false && boss.signedIn === true && t.d.team.find((x) => x.email === 'maria@example.com').scoops === true && !('user_id' in boss), boss);
  t = await call('/api/office/team', 'POST', { name: 'Juan Test', email: 'juan@example.com', phone: '442-555-0190', role: 'owner', scoops: true }, owner);
  const juan = t.d.team.find((x) => x.email === 'juan@example.com');
  ok('an owner can be added who also runs a route', t.status === 200 && juan && juan.role === 'owner' && juan.scoops === true && juan.signedIn === false && juan.phone === '4425550190', juan);
  t = await call('/api/office/team', 'POST', { name: 'Short Phone', email: 'short@example.com', phone: '555-0190', role: 'office' }, owner);
  ok('a mobile number that is not 10 digits is refused', t.status === 400 && /10 digit/.test(t.d.error), t.d);
  t = await call('/api/office/team', 'POST', { id: juan.id, name: 'Juan G Test', phone: '(442) 555-0191' }, owner);
  ok('name and mobile can be changed', t.d.team.find((x) => x.id === juan.id).name === 'Juan G Test' && t.d.team.find((x) => x.id === juan.id).phone === '4425550191');
  // With no scooper on the team, the yards go to the owner who runs a route, not to the first owner on the list.
  const off = (await db.query(`update public.staff set active = false where role = 'scooper' and active returning id`)).rows.map((x) => x.id);
  let w = await call('/api/office/week', 'POST', { mode: 'all', apply: false }, owner);
  ok('the week plan gives the yards to the owner who scoops', w.status === 200 && w.d.slots.length > 0 && w.d.slots.every((x) => x.staffId === juan.id), w.d.slots && w.d.slots.map((x) => x.name));
  t = await call('/api/office/team', 'POST', { id: juan.id, scoops: false }, owner);
  w = await call('/api/office/week', 'POST', { mode: 'all', apply: false }, owner);
  ok('taken off routes, the plan falls back to the first person on the team', t.d.team.find((x) => x.id === juan.id).scoops === false && w.d.slots.every((x) => x.staffId === boss.id), w.d.slots && w.d.slots.map((x) => x.name));
  await db.query(`update public.staff set active = true where id = any($1)`, [off]);
  await db.query(`update public.staff set active = false where id = $1`, [juan.id]);

  // Leads: the time we first reached them is kept once.
  let l = await call('/api/office/lead', 'POST', { kind: 'phone', name: 'Fast Lead', phone: '6235550177' }, owner);
  const lead = l.d.leads.find((x) => x.name === 'Fast Lead');
  ok('a new lead has the time it came in and no reach time yet', lead && lead.created_at && lead.contacted_at == null, lead);
  l = await call('/api/office/lead', 'POST', { id: lead.id, notes: 'Left a voicemail' }, owner);
  ok('a note alone does not stop the clock', l.d.leads.find((x) => x.id === lead.id).contacted_at == null);
  l = await call('/api/office/lead', 'POST', { id: lead.id, status: 'contacted' }, owner);
  const at1 = l.d.leads.find((x) => x.id === lead.id).contacted_at;
  ok('moving off New saves the time we reached them', !!at1 && Date.parse(at1) >= Date.parse(lead.created_at), at1);
  await new Promise((res) => setTimeout(res, 30));
  l = await call('/api/office/lead', 'POST', { id: lead.id, status: 'won' }, owner);
  ok('a later status never moves that time', l.d.leads.find((x) => x.id === lead.id).contacted_at === at1 && l.d.leads.find((x) => x.id === lead.id).status === 'won');

  // Health: Clear the list hides what came before and deletes nothing.
  await db.query(`insert into public.errors (source, path, message) values ('server', '/api/checkout', 'Old trouble')`);
  let hh = await call('/api/office/health', 'GET', null, owner);
  const before = (await db.query('select count(*)::int n from public.errors')).rows[0].n;
  ok('the Health list shows the trouble', hh.d.errors.some((e) => e.message === 'Old trouble'));
  hh = await call('/api/office/health/clear', 'POST', {}, mt);
  ok('a scooper cannot clear the list', hh.status === 403);
  hh = await call('/api/office/health/clear', 'POST', {}, owner);
  ok('Clear the list empties the screen and deletes nothing', hh.status === 200 && hh.d.errors.length === 0 && !!hh.d.cleared && (await db.query('select count(*)::int n from public.errors')).rows[0].n === before, { shown: hh.d.errors.length, rows: before });
  await db.query(`insert into public.errors (source, path, message) values ('server', '/api/checkout', 'New trouble')`);
  hh = await call('/api/office/health', 'GET', null, owner);
  ok('new trouble after the clear still shows', hh.d.errors.length === 1 && hh.d.errors[0].message === 'New trouble', hh.d.errors);
  const st2 = await call('/api/office/settings', 'GET', null, owner);
  ok('the clear time does not disturb the planner settings', st2.status === 200 && st2.d.cap >= 5, st2.d);

  // Money: names behind the numbers.
  const mm = await call('/api/office/money', 'GET', null, owner);
  ok('Money lists who is in a free month and who stopped at the card step', Array.isArray(mm.d.freeMonth.list) && mm.d.freeMonth.list.length === mm.d.freeMonth.count && Array.isArray(mm.d.startedList) && mm.d.startedList.length === mm.d.started, mm.d);
}


/* ---------- texts that send on their own (Twilio), November 21, 2026 ---------- */
console.log('\nTexts send on their own');
if (OLD) console.log('  skipped: this run is the database before the patch');
else {
  Object.assign(env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'twilio_token_test', TWILIO_MESSAGING_SERVICE_SID: 'MGtest', RESEND_API_KEY: 're_test', CRON_SECRET: 'cron-secret-for-tests-1234', SMS_HOURS: '0-24' });
  const settle = async () => { while (waits.length) await Promise.all(waits.splice(0)); };
  const mailsTo = (to) => mailBodies.map((b) => { try { return JSON.parse(b); } catch (e) { return null; } }).flat().filter((m) => m && [].concat(m.to).includes(to));
  const msgs = async (cidX) => (await db.query('select * from public.messages where customer_id = $1 order by id', [cidX])).rows;
  const twSign = (url, params) => crypto.createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
  const tw = async (pathname, params, sig) => {
    const url = 'https://arizonapetwaste.com' + pathname;
    const res = await worker.fetch(new Request(url, { method: 'POST', body: new URLSearchParams(params).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig === undefined ? twSign(url, params) : sig } }), env, ctx);
    return { status: res.status, text: await res.text() };
  };
  const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sRealId = (d) => d.stops.find((x) => x.customer.name === 'Dana Real').id;
  const tomorrow = new Date(Date.parse(today + 'T19:00:00Z') + 864e5).toISOString().slice(0, 10), wd2 = (wd + 1) % 7, otherDay = (wd + 3) % 7;
  r = await call('/api/office/team', 'POST', { name: 'Tess Truck', email: 'tess@example.com', phone: '623-555-0190', role: 'scooper' }, owner);
  const tess = r.d.team.find((t) => t.email === 'tess@example.com');
  const mk = async (email, name, phone, texts, extra) => {
    const id = await authUser(email);
    await db.query(`insert into public.customers (id, email, name, phone, address, zip, area, plan, dogs, status, texts_visit, lat, lng, scooper_id) values ($1,$2,$3,$4,'1 Test Way','85338','goodyear','week',2,'trialing',$5,33.44,-112.36,$6)`, [id, email, name, phone, texts, tess.id]);
    if (extra != null) await db.query(`update public.customers set service_day = $1, service_time = '09:00' where id = $2`, [extra, id]);
    return id;
  };
  const joe = await mk('joe-test@example.com', 'Lopez, Joseph', '6235550201', true);
  const real = await mk('real@example.com', 'Dana Real', '6235550202', true);
  const quiet = await mk('quiet@example.com', 'NO TEXTS', '6235550203', false);

  // Test mode: only the listed number hears anything new.
  env.SMS_TEST_ALLOWLIST = '(623) 555-0201';
  let m0 = mailBodies.length, t0 = TW.sent.length;
  // The core rule (Joe, Nov 21, 2026): a day AND a time. Nothing goes out until both are set.
  r = await call('/api/office/customer', 'POST', { id: joe, service_day: wd2 }, owner);
  ok('a day with no time tells nobody, even the test customer: the card says to pick a time', r.status === 200 && r.d.told && r.d.told.needTime === true && TW.sent.length === t0 && mailsTo('joe-test@example.com').length === 0 && (await msgs(joe)).length === 0 && r.d.timesOn === true, r.d.told);
  r = await call('/api/office/customer', 'POST', { id: joe, service_time: '25:99' }, owner);
  ok('a time that is not a time is refused', r.status === 400, r.d);
  r = await call('/api/office/day?date=' + today, 'GET', null, owner);
  ok('a booked house with a day and no time is on the "no day and time yet" list', r.d.timesOn === true && r.d.needDay.some((x) => x.id === joe && x.service_day === wd2) && r.d.needDay.some((x) => x.id === real && x.service_day === null), r.d.needDay.length);
  r = await call('/api/office/customer', 'POST', { id: real, service_day: wd2, service_time: '11:00' }, owner);
  ok('test mode: a day and time set for a customer who is not on the test list tells nobody (no text, no email, nothing waiting)', r.status === 200 && r.d.told && r.d.told.test === true && TW.sent.length === t0 && mailsTo('real@example.com').length === 0 && (await msgs(real)).length === 0, r.d.told);
  r = await call('/api/office/customer', 'POST', { id: joe, service_time: '10:30' }, owner);
  const dayTxt = TW.sent[TW.sent.length - 1] || {};
  ok('test mode: setting the time is what sends the test customer the day and time text, through the Messaging Service', TW.sent.length === t0 + 1 && dayTxt.to === '+16235550201' && dayTxt.service === 'MGtest' && dayTxt.account === 'ACtest' && dayTxt.callback === 'https://arizonapetwaste.com/api/twilio/status'
    && new RegExp('^Arizona Pet Waste: Your service day is ' + DAYN[wd2] + ' around 10:30 AM\\. Your next visit is ' + DAYN[wd2] + ', [A-Z][a-z]{2} \\d{1,2}\\. We text you the night before each visit\\. Reply STOP to opt out\\.$').test(dayTxt.body), dayTxt);
  ok('the Twilio call is signed in with the account id and token, and the token is nowhere in the text', dayTxt.auth === 'Basic ' + Buffer.from('ACtest:twilio_token_test').toString('base64') && !/twilio_token_test/.test(JSON.stringify([dayTxt.body, dayTxt.callback])));
  const joeMail = mailsTo('joe-test@example.com');
  ok('and the "your day is set" email, which says Hi Joseph for a name typed "Lopez, Joseph"', joeMail.length === 1 && joeMail[0].subject === 'Your service day is ' + DAYN[wd2] + ' around 10:30 AM' && /^Hi Joseph,\n\nYour service day is \w+ around 10:30 AM\. Your next visit is /.test(joeMail[0].text) && /30 minute window and a link to watch our truck/.test(joeMail[0].text), joeMail.map((x) => x.subject));
  ok('the office is told who was told, and what', r.d.told && r.d.told.mailed === true && r.d.told.text === 'sent' && r.d.told.say === DAYN[wd2] + ' around 10:30 AM', r.d.told);
  let rows = await msgs(joe);
  ok('the text is in the log as sent, with Twilio\'s id', rows.length === 1 && rows[0].kind === 'day_set' && rows[0].status === 'sent' && rows[0].provider_id === dayTxt.sid && rows[0].sent_at, rows.map((x) => [x.kind, x.status]));
  r = await call('/api/office/customer', 'POST', { id: joe, service_day: wd2, service_time: '10:30', gate_code: '1234' }, owner);
  ok('saving the card again with the same day and time sends nothing', TW.sent.length === t0 + 1 && mailsTo('joe-test@example.com').length === 1 && !r.d.told);

  // Delivery news from Twilio.
  let w = await tw('/api/twilio/status', { MessageSid: dayTxt.sid, MessageStatus: 'delivered' }, 'bm90IGEgcmVhbCBzaWduYXR1cmU=');
  ok('a "delivered" that Twilio did not sign is refused', w.status === 403 && (await msgs(joe))[0].status === 'sent', w);
  w = await tw('/api/twilio/status', { MessageSid: dayTxt.sid, MessageStatus: 'delivered', To: '+16235550201' });
  rows = await msgs(joe);
  ok('a signed "delivered" marks the text delivered', w.status === 200 && rows[0].status === 'delivered' && rows[0].delivered_at, [w.status, rows[0].status]);

  // The office changes the day: a "new service day" text and email.
  r = await call('/api/office/customer', 'POST', { id: joe, service_day: otherDay }, owner);
  ok('a changed day sends "Your new service day" by text and email', /Your new service day is /.test((TW.sent[TW.sent.length - 1] || {}).body) && mailsTo('joe-test@example.com').some((x) => /^Your new service day is /.test(x.subject)));
  await call('/api/office/customer', 'POST', { id: joe, service_day: wd2 }, owner);
  // The office changes only the time: that is a change too.
  let tA = TW.sent.length, mA = mailsTo('joe-test@example.com').length;
  r = await call('/api/office/customer', 'POST', { id: joe, service_time: '14:00' }, owner);
  ok('a changed time sends the new day and time by text and email', TW.sent.length === tA + 1 && TW.sent[tA].body.startsWith('Arizona Pet Waste: Your new service day is ' + DAYN[wd2] + ' around 2:00 PM.') && mailsTo('joe-test@example.com').length === mA + 1 && r.d.customer.service_time === '14:00', TW.sent.slice(tA));
  tA = TW.sent.length; mA = mailsTo('joe-test@example.com').length;
  r = await call('/api/office/customer', 'POST', { id: joe, tell: true }, owner);
  ok('"Send their day and time again" sends the same schedule once more and saves nothing', r.status === 200 && TW.sent.length === tA + 1 && /^Arizona Pet Waste: Your service day is \w+ around 2:00 PM\./.test(TW.sent[tA].body) && mailsTo('joe-test@example.com').length === mA + 1, TW.sent.slice(tA));
  await call('/api/office/customer', 'POST', { id: joe, service_time: '10:30' }, owner);

  // Test mode off: everyone who said yes to texts.
  delete env.SMS_TEST_ALLOWLIST;
  t0 = TW.sent.length;
  r = await call('/api/office/customer', 'POST', { id: real, service_day: otherDay }, owner);
  ok('with test mode off a real customer gets the day text and email', TW.sent.length === t0 + 1 && TW.sent[t0].to === '+16235550202' && mailsTo('real@example.com').length === 1 && r.d.told.text === 'sent');
  r = await call('/api/office/customer', 'POST', { id: quiet, service_day: wd2, service_time: '12:00' }, owner);
  ok('a customer who said no to texts gets the email only, greeted "Hi No" from "NO TEXTS"', TW.sent.length === t0 + 1 && mailsTo('quiet@example.com').length === 1 && /^Hi No,/.test(mailsTo('quiet@example.com')[0].text) && r.d.told.mailed && r.d.told.text === 'none', r.d.told);
  await call('/api/office/customer', 'POST', { id: real, service_day: wd2 }, owner);

  // A customer texts us.
  await settle(); m0 = mailBodies.length;
  w = await tw('/api/twilio/inbound', { From: '+16235550202', Body: 'Stop', MessageSid: 'SMin1' }, 'AAAA');
  ok('an unsigned STOP is refused', w.status === 403 && (await db.query('select texts_visit from public.customers where id = $1', [real])).rows[0].texts_visit === true);
  await db.query(`insert into public.messages (customer_id, kind, channel, to_addr, body) values ($1, 'day_set', 'sms', '6235550202', 'waiting text')`, [real]);
  w = await tw('/api/twilio/inbound', { From: '+16235550202', Body: ' Stop ', MessageSid: 'SMin1' });
  await settle();
  let cr = (await db.query('select texts_visit, texts_stopped_at from public.customers where id = $1', [real])).rows[0];
  ok('a signed STOP turns visit texts off, drops what was waiting, and we send no reply of our own (Twilio answers STOP)', w.status === 200 && /<Response><\/Response>/.test(w.text) && cr.texts_visit === false && cr.texts_stopped_at
    && (await msgs(real)).filter((x) => x.body === 'waiting text')[0].status === 'skipped', cr);
  ok('the office gets an email about the STOP, and it is written to the consent log', mailsTo('info@arizonapetwaste.com').some((x) => x.subject === 'Texts stopped: Dana Real')
    && (await db.query(`select granted from public.consent_log where phone = '6235550202' order by id desc limit 1`)).rows[0].granted === false);
  t0 = TW.sent.length;
  r = await call('/api/office/customer', 'POST', { id: real, service_day: otherDay }, owner);
  ok('after STOP a day change sends the email and no text', TW.sent.length === t0 && r.d.told.mailed === true && r.d.told.text === 'none', r.d.told);
  const sentRow = (await msgs(real)).find((x) => x.status === 'sent' || x.status === 'delivered');
  r = await call('/api/office/text/send', 'POST', { id: sentRow.id }, owner);
  ok('"Resend text" is refused for a customer who said STOP', r.status === 400 && /said no to texts/.test(r.d.error) && TW.sent.length === t0, r.d);
  w = await tw('/api/twilio/inbound', { From: '+16235550202', Body: 'START', MessageSid: 'SMin2' });
  cr = (await db.query('select texts_visit, texts_stopped_at from public.customers where id = $1', [real])).rows[0];
  ok('START turns texts back on for someone who had stopped', cr.texts_visit === true && cr.texts_stopped_at === null, cr);
  w = await tw('/api/twilio/inbound', { From: '+16235550203', Body: 'start', MessageSid: 'SMin3' });
  ok('START from someone who never agreed to texts turns nothing on', (await db.query('select texts_visit from public.customers where id = $1', [quiet])).rows[0].texts_visit === false);
  await settle(); m0 = mailBodies.length;
  w = await tw('/api/twilio/inbound', { From: '+16235550201', Body: 'You missed a pile by the shed', MessageSid: 'SMin4' });
  w = await tw('/api/twilio/inbound', { From: '+16235550201', Body: 'You missed a pile by the shed', MessageSid: 'SMin4' });
  await settle();
  const got = (await msgs(joe)).filter((x) => x.kind === 'reply');
  ok('a real reply is saved once and emailed to the office once, even when Twilio calls twice', got.length === 1 && got[0].status === 'received' && got[0].body === 'You missed a pile by the shed'
    && mailsTo('info@arizonapetwaste.com').filter((x) => /^Text from Lopez, Joseph: You missed a pile/.test(x.subject)).length === 1, got.length);

  // Resend from the customer card.
  t0 = TW.sent.length;
  const first1 = (await msgs(joe))[0];
  r = await call('/api/office/text/send', 'POST', { id: first1.id }, owner);
  ok('"Resend text" sends a new copy and keeps the first in the log', r.status === 200 && TW.sent.length === t0 + 1 && TW.sent[t0].body === first1.body && (await msgs(joe)).filter((x) => x.body === first1.body).length === 2, r.d);
  r = await call('/api/office/text/send', 'POST', { id: first1.id }, mt);
  ok('a scooper cannot resend texts', r.status === 403);
  env.SMS_TEST_ALLOWLIST = '6235559999';
  r = await call('/api/office/text/send', 'POST', { id: first1.id }, owner);
  ok('test mode also holds "Resend text": a number that is not on the list gets nothing', r.status === 409 && TW.sent.length === t0 + 1, r.d);
  delete env.SMS_TEST_ALLOWLIST;

  // Welcome email again, and My Yard status.
  await db.query(`update public.customers set name = 'Besserer Dan' where id = $1`, [joe]);
  r = await call('/api/office/customer?id=' + joe, 'GET', null, owner);
  ok('My Yard status: invited, not signed in yet', r.d.yard && r.d.yard.invited === true && r.d.yard.lastSeenAt === null && r.d.yard.resent === false, r.d.yard);
  r = await call('/api/office/customer', 'POST', { id: joe, name: 'Dan Besserer' }, owner);
  ok('the office can fix a name typed last name first', r.status === 200 && r.d.customer.name === 'Dan Besserer' && !r.d.told);
  m0 = mailsTo('joe-test@example.com').length;
  r = await call('/api/office/customer/welcome', 'POST', { id: joe }, owner);
  const wel = mailsTo('joe-test@example.com').slice(m0);
  ok('"Resend welcome email" sends it with a fresh My Yard link, says Hi Dan and what happens next', r.status === 200 && wel.length === 1 && wel[0].subject === 'You are booked with Arizona Pet Waste' && /^Hi Dan,/.test(wel[0].text)
    && /You are booked with Arizona Pet Waste\. Thank you\.\n\nWe will reach out with your start date\. If you booked over the weekend, you will hear from us on Monday\./.test(wel[0].text)
    && /What happens next:\n1\. We send your start date, with your service day and time, by text and email\.\n2\. The night before each visit, we text you a reminder\.\n3\. On visit day, we text you when we are on the way\./.test(wel[0].text)
    && /https:\/\/arizonapetwaste\.com\/account\/\?k=[0-9a-f-]{36}\.\d{10}\./.test(wel[0].text), wel.map((x) => x.text.slice(0, 300)));
  TW.seen[joe] = '2026-11-21T20:15:00Z';
  r = await call('/api/office/customer?id=' + joe, 'GET', null, owner);
  ok('My Yard status: invited again, and the last sign in shows', r.d.yard.resent === true && r.d.yard.lastSeenAt === '2026-11-21T20:15:00Z' && r.d.texts.some((x) => x.kind === 'welcome' && x.channel === 'email' && x.status === 'sent'), r.d.yard);
  r = await call('/api/office/customer/welcome', 'POST', { id: joe }, mt);
  ok('a scooper cannot resend the welcome email', r.status === 403);
  env.SMS_TEST_ALLOWLIST = '6235559999'; m0 = mailsTo('joe-test@example.com').length;
  r = await call('/api/office/customer/welcome', 'POST', { id: joe }, owner);
  ok('test mode holds "Resend welcome email" too: a customer who is not on the test list gets no email', r.status === 409 && /Test mode is on/.test(r.d.error) && mailsTo('joe-test@example.com').length === m0, r.d);
  env.SMS_TEST_ALLOWLIST = '+16235550201';
  r = await call('/api/office/customer/welcome', 'POST', { id: joe }, owner);
  ok('and a customer on the test list still gets it (the list may be written +1623...)', r.status === 200 && mailsTo('joe-test@example.com').length === m0 + 1);
  delete env.SMS_TEST_ALLOWLIST;

  // The night before run.
  await db.query('update public.customers set service_day = $1, stop_order = null where id = any($2)', [wd2, [joe, real, quiet]]);
  await db.query(`update public.customers set service_time = '10:30' where id = $1`, [joe]);
  await db.query(`update public.customers set service_time = '09:15' where id = $1`, [real]);
  await db.query(`update public.customers set service_time = '12:00' where id = $1`, [quiet]);
  await db.query('delete from public.stops where day = $1 and customer_id = any($2)', [tomorrow, [joe, real, quiet]]);
  // A booked house whose time the office has not set yet: it is on the route and gets no text.
  const noTime = await mk('notime@example.com', 'Nia Notime', '6235550206', true);
  await db.query('update public.customers set service_day = $1 where id = $2', [wd2, noTime]);
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': 'wrong-secret-wrong-secret' });
  ok('the evening run needs the right secret', r.status === 401);
  await db.query(`update public.messages set status = 'skipped' where status = 'queued'`); // texts the older tests left waiting
  env.SMS_BATCH = '1'; t0 = TW.sent.length;
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  ok('the evening run builds tomorrow, writes a text for each customer with texts on and a time set, and sends them a few at a time', r.status === 200 && r.d.day === tomorrow && r.d.stops === 4 && r.d.timed === 3 && r.d.queued === 2 && r.d.sent === 1 && r.d.left === 1, r.d);
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  ok('the next call sends the rest and writes no second text', r.d.queued === 0 && r.d.sent === 1 && r.d.left === 0 && TW.sent.length === t0 + 2, r.d);
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  ok('running it again sends nothing', r.d.sent === 0 && TW.sent.length === t0 + 2, r.d);
  delete env.SMS_BATCH;
  const night = TW.sent.slice(t0);
  const codeOf = async (id) => (await db.query('select code from public.stops where customer_id = $1 and day = $2', [id, tomorrow])).rows[0].code;
  const nJoe = night.find((x) => x.to === '+16235550201'), nReal = night.find((x) => x.to === '+16235550202');
  ok('the night before text says the day, the time the office set, the 30 minute window around it, and has the truck link for that visit', !!nJoe && !!nReal
    && nJoe.body === 'Arizona Pet Waste: We will be there tomorrow (' + DAYN[wd2] + ') around 10:30 AM, between 10:15 and 10:45 AM. Please unlock the gate and keep your dogs inside. Watch the truck on the way: arizonapetwaste.com/t/' + await codeOf(joe) + ' Reply STOP to opt out.'
    && nReal.body.includes('around 9:15 AM, between 9:00 and 9:30 AM') && nReal.body.includes('/t/' + await codeOf(real)), night.map((x) => x.body));
  ok('a house with a day and no time gets no night before text', !night.some((x) => x.to === '+16235550206') && (await msgs(noTime)).length === 0);
  const posOf = async (id) => (await db.query('select position from public.stops where customer_id = $1 and day = $2', [id, tomorrow])).rows[0].position;
  ok('the route is in time order: 9:15, then 10:30, then 12:00, then the house with no time', (await posOf(real)) < (await posOf(joe)) && (await posOf(joe)) < (await posOf(quiet)) && (await posOf(quiet)) < (await posOf(noTime)), [await posOf(real), await posOf(joe), await posOf(quiet), await posOf(noTime)]);
  r = await call('/api/office/day?date=' + tomorrow, 'GET', null, owner);
  const sJoe = r.d.stops.find((x) => x.customer.id === joe), sNo = r.d.stops.find((x) => x.customer.id === noTime);
  ok('the Schedule shows each visit\'s time', r.d.times[sJoe.id] === '10:30' && r.d.times[sNo.id] === null, r.d.times);

  // The owner sends one customer the night before text now, to test without waiting for the evening run.
  t0 = TW.sent.length;
  r = await call('/api/office/customer/night', 'POST', { id: joe }, mt);
  ok('a scooper cannot send the night before text by hand', r.status === 403 && TW.sent.length === t0);
  env.SMS_TEST_ALLOWLIST = '6235559999';
  r = await call('/api/office/customer/night', 'POST', { id: joe }, owner);
  ok('in test mode it is refused for a customer who is not on the test list', r.status === 409 && TW.sent.length === t0, r.d);
  r = await call('/api/office/customer/night', 'POST', { id: noTime }, owner);
  env.SMS_TEST_ALLOWLIST = '6235550201';
  ok('it needs a day and a time', r.status === 400 && /day and time/.test(r.d.error), r.d);
  env.SMS_HOURS = '0-0';
  r = await call('/api/office/customer/night', 'POST', { id: joe }, owner);
  env.SMS_HOURS = '0-24';
  ok('the owner sends the night before text for one customer, right now, even late at night', r.status === 200 && r.d.night.state === 'sent' && r.d.night.day === tomorrow && r.d.night.linkOpens === true && TW.sent.length === t0 + 1 && TW.sent[t0].to === '+16235550201'
    && TW.sent[t0].body === nJoe.body, r.d.night);
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  ok('the evening run does not send that visit another one', r.d.queued === 0 && TW.sent.length === t0 + 1, r.d);
  delete env.SMS_TEST_ALLOWLIST;

  // A one time change in the Field App: this visit gets another time, and the customer hears it.
  t0 = TW.sent.length; m0 = mailsTo('joe-test@example.com').length;
  r = await call('/api/office/stop', 'POST', { id: sJoe.id, action: 'time', time: '15:00' }, owner);
  const chg = TW.sent[t0] || {};
  ok('a new time for one visit texts and emails the customer that visit\'s day and time', r.status === 200 && r.d.times[sJoe.id] === '15:00' && TW.sent.length === t0 + 1 && chg.to === '+16235550201'
    && new RegExp('^Arizona Pet Waste: Your visit is now ' + DAYN[wd2] + ', [A-Z][a-z]{2} \\d{1,2} around 3:00 PM\\. This change is for that visit only\\. Reply STOP to opt out\\.$').test(chg.body)
    && mailsTo('joe-test@example.com').slice(m0).some((x) => /^Your visit is now .* around 3:00 PM$/.test(x.subject)), chg);
  ok('the usual time did not change, and the route went back into time order', (await db.query('select service_time from public.customers where id = $1', [joe])).rows[0].service_time === '10:30' && (await posOf(joe)) > (await posOf(quiet)), [await posOf(joe), await posOf(quiet)]);
  r = await call('/api/office/stop', 'POST', { id: sJoe.id, action: 'time', time: '15:00' }, owner);
  ok('saving the same time again tells nobody', TW.sent.length === t0 + 1);
  // A night before text that has not gone out yet gets the new time.
  await db.query(`update public.messages set status = 'queued', sent_at = null where stop_id = $1 and kind = 'night_before' and channel = 'sms'`, [sRealId(r.d)]);
  env.SMS_HOURS = '0-0';
  r = await call('/api/office/stop', 'POST', { id: sRealId(r.d), action: 'time', time: '13:30' }, owner);
  env.SMS_HOURS = '0-24';
  const qRows = (await msgs(real)).filter((x) => x.status === 'queued');
  ok('a waiting night before text gets the new time, and at night the change text waits too', qRows.filter((x) => x.kind === 'night_before').length === 1 && qRows.filter((x) => x.kind === 'night_before').every((x) => /around 1:30 PM, between 1:15 and 1:45 PM/.test(x.body)) && qRows.some((x) => x.kind === 'visit_change'), qRows.map((x) => [x.kind, x.status, x.body.slice(20, 70)]));
  await db.query(`update public.messages set status = 'skipped' where customer_id = $1 and status = 'queued'`, [real]);
  r = await call('/api/office/stop', 'POST', { id: sJoe.id, action: 'time', time: '' }, owner);
  ok('clearing the one time change puts the visit back on the usual time and says so', r.d.times[sJoe.id] === '10:30' && /around 10:30 AM\. This change/.test((TW.sent[TW.sent.length - 1] || {}).body), TW.sent.slice(-1));
  r = await call('/api/office/stop', 'POST', { id: sJoe.id, action: 'time', time: '09:00' }, mt);
  ok('a scooper cannot change a visit\'s time', r.status === 403);
  r = await call('/api/track/' + await codeOf(joe), 'GET');
  ok('that link opens the night before', r.status === 200 && r.d.status === 'scheduled' && !r.d.expired, r.d);
  r = await call('/api/office/health', 'GET', null, owner);
  ok('Health shows texts are on and when the evening run last called in', r.d.checks.texts === true && r.d.textsTest === null && !!r.d.nightRanAt && r.d.timesOn === true, { texts: r.d.checks.texts, ran: r.d.nightRanAt });

  // Quiet hours: a day text set late at night waits, and the evening run sends it.
  env.SMS_HOURS = '0-0'; t0 = TW.sent.length;
  r = await call('/api/office/customer', 'POST', { id: joe, service_day: otherDay }, owner);
  ok('outside 8 am to 9 pm a day text waits in the Texts tab', TW.sent.length === t0 && r.d.told.text === 'queued', r.d.told);
  env.SMS_HOURS = '0-24';
  await call('/api/office/customer', 'POST', { id: joe, service_day: wd2 }, owner);
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  ok('the evening run sends the day text that waited', TW.sent.slice(t0).some((x) => x.to === '+16235550201' && /Your new service day is /.test(x.body)), TW.sent.slice(t0).map((x) => x.body.slice(0, 50)));

  // Visit day: on the way and done go out right away.
  const todayC = await mk('today@example.com', 'Tia Today', '6235550204', true, wd);
  // The next yard on the same route has no time set: it is served, and it gets no "on our way" text.
  const laterC = await mk('later@example.com', 'Lou Later', '6235550207', true);
  await db.query('update public.customers set service_day = $1 where id = $2', [wd, laterC]);
  codes['tess@example.com'] = '123456';
  await call('/api/staff/code', 'POST', { email: 'tess@example.com' });
  r = await call('/api/staff/verify', 'POST', { email: 'tess@example.com', code: '123456' });
  const tt = r.d.session.access_token;
  r = await call('/api/crew/today', 'GET', null, tt);
  const stop = r.d.stops.find((x) => x.customer.id === todayC);
  t0 = TW.sent.length;
  r = await call('/api/crew/start', 'POST', { locationOk: true }, tt);
  await call('/api/crew/start', 'POST', { locationOk: true }, tt);
  ok('Start route is the tap for the first house: its "on our way" text goes right away, with the truck link, once', TW.sent.length === t0 + 1 && TW.sent[t0].to === '+16235550204' && TW.sent[t0].body === 'Arizona Pet Waste: We are on our way! Here is the truck: arizonapetwaste.com/t/' + stop.code && r.d.texts.length === 0 && r.d.tap === null, TW.sent.slice(t0));
  r = await call('/api/crew/onway', 'POST', { stopId: stop.id }, mt);
  ok('another worker cannot start this house', r.status === 404 && TW.sent.length === t0 + 1);
  await call('/api/crew/arrive', 'POST', { stopId: stop.id }, tt);
  await call('/api/crew/photo', 'POST', { stopId: stop.id, image: jpg }, tt);
  m0 = mailsTo('today@example.com').length;
  r = await call('/api/crew/done', 'POST', { stopId: stop.id }, tt);
  const doneTxt = TW.sent[TW.sent.length - 1];
  ok('Done sends the gate photo text right away, and no email while the text is on its way', TW.sent.length === t0 + 2 && /^Arizona Pet Waste: Your yard is done\. See your latched gate: arizonapetwaste\.com\/t\//.test(doneTxt.body) && mailsTo('today@example.com').length === m0, doneTxt);
  const nextUp = r.d.stops.find((x) => x.customer.id === laterC);
  ok('after Done the next house is not started: it waits for Start next house, and its customer gets nothing', !!nextUp && nextUp.status === 'scheduled' && r.d.tap === nextUp.id && TW.sent.length === t0 + 2 && (await msgs(laterC)).length === 0, nextUp && nextUp.status);
  r = await call('/api/crew/onway', 'POST', { stopId: nextUp.id }, tt);
  ok('Start next house for a yard with no time set: the truck heads there and no "on our way" text goes out', r.d.stops.find((x) => x.id === nextUp.id).status === 'on_the_way' && TW.sent.length === t0 + 2 && (await msgs(laterC)).length === 0);
  w = await tw('/api/twilio/status', { MessageSid: doneTxt.sid, MessageStatus: 'undelivered', ErrorCode: '30003' });
  w = await tw('/api/twilio/status', { MessageSid: doneTxt.sid, MessageStatus: 'undelivered', ErrorCode: '30003' });
  const fb = mailsTo('today@example.com').slice(m0);
  rows = await msgs(todayC);
  ok('the done text did not reach the phone: the gate photo goes by email, once', fb.length === 1 && fb[0].subject === 'Your yard is done. Here is your gate photo.' && fb[0].text.includes('https://arizonapetwaste.com/t/' + stop.code)
    && rows.filter((x) => x.kind === 'done' && x.channel === 'email' && x.status === 'sent').length === 1, fb.map((x) => x.subject));
  const failedRow = rows.find((x) => x.kind === 'done' && x.channel === 'sms');
  ok('the log says the text did not send and why, in plain words', failedRow.status === 'failed' && /phone was off or out of reach/.test(failedRow.error), [failedRow.status, failedRow.error]);
  r = await call('/api/office/texts', 'GET', null, owner);
  ok('the Texts screen is the log: on, not in test mode, with the failed text and its reason', r.d.twilio === true && r.d.test === null && r.d.log.some((x) => x.id === failedRow.id && x.status === 'failed' && x.error) && r.d.log.some((x) => x.kind === 'reply'), { n: r.d.log.length });

  // Twilio refuses a text outright (the number opted out at the carrier): email, and texts off.
  const refC = await mk('refused@example.com', 'Rae Refused', '6235550205', true, wd);
  await call('/api/office/plan', 'POST', { date: today }, owner);
  const rs = (await db.query('select id, code from public.stops where customer_id = $1 and day = $2', [refC, today])).rows[0];
  await db.query(`update public.stops set status = 'here', photo_path = 'x/y.jpg' where id = $1`, [rs.id]);
  files['gate-photos/x/y.jpg'] = 10;
  TW.fail = 21610; m0 = mailsTo('refused@example.com').length;
  r = await call('/api/crew/done', 'POST', { stopId: rs.id }, tt);
  await settle();
  rows = await msgs(refC);
  ok('a done text Twilio refuses (they replied STOP to Twilio): the photo goes by email and texts turn off', r.status === 200 && mailsTo('refused@example.com').length === m0 + 1 && rows.some((x) => x.kind === 'done' && x.channel === 'sms' && x.status === 'failed' && /replied STOP/.test(x.error))
    && (await db.query('select texts_visit from public.customers where id = $1', [refC])).rows[0].texts_visit === false, rows.map((x) => [x.kind, x.channel, x.status]));
  r = await call('/api/office/health', 'GET', null, owner);
  ok('a failed text shows on the Health screen', r.d.errors.some((e) => e.message === 'A text did not send'));

  // Moving a visit to another day. One time: the customer hears that visit's new day, at their usual time.
  const mover = await mk('mover@example.com', 'Mo Mover', '6235550208', true);
  await db.query(`update public.customers set service_day = $1, service_time = '08:00' where id = $2`, [wd2, mover]);
  await call('/api/office/plan', 'POST', { date: tomorrow }, owner);
  const day3 = new Date(Date.parse(tomorrow + 'T19:00:00Z') + 864e5).toISOString().slice(0, 10), day4 = new Date(Date.parse(tomorrow + 'T19:00:00Z') + 2 * 864e5).toISOString().slice(0, 10);
  let ms = (await db.query('select id from public.stops where customer_id = $1 and day = $2', [mover, tomorrow])).rows[0];
  t0 = TW.sent.length; m0 = mailsTo('mover@example.com').length;
  r = await call('/api/office/move-day', 'POST', { ids: [ms.id], to: day3 }, owner);
  ok('a visit moved to another day, just this once: the customer is told that visit\'s new day at their usual time', r.status === 200 && r.d.moved === 1 && TW.sent.length === t0 + 1 && TW.sent[t0].to === '+16235550208'
    && new RegExp('^Arizona Pet Waste: Your visit is now ' + DAYN[(wd2 + 1) % 7] + ', [A-Z][a-z]{2} \\d{1,2} around 8:00 AM\\. This change is for that visit only\\.').test(TW.sent[t0].body) && mailsTo('mover@example.com').length === m0 + 1, TW.sent.slice(t0));
  ms = (await db.query('select id, visit_time from public.stops where customer_id = $1 and day = $2', [mover, day3])).rows[0];
  ok('the moved visit keeps the time', ms && ms.visit_time === '08:00', ms);
  // For good: the usual day changes, the time stays, and the customer gets the new schedule.
  t0 = TW.sent.length;
  r = await call('/api/office/move-day', 'POST', { ids: [ms.id], to: day4, forever: true }, owner);
  let mv = (await db.query('select service_day, service_time from public.customers where id = $1', [mover])).rows[0];
  ok('a visit moved for good: the customer gets "Your new service day" with the day and the time', r.status === 200 && mv.service_day === (wd2 + 2) % 7 && mv.service_time === '08:00' && TW.sent.length === t0 + 1
    && TW.sent[t0].body.startsWith('Arizona Pet Waste: Your new service day is ' + DAYN[(wd2 + 2) % 7] + ' around 8:00 AM.'), TW.sent.slice(t0));
  // The same move for a house with no time set: the day moves and nobody is told.
  await call('/api/office/plan', 'POST', { date: tomorrow }, owner);
  const ns = (await db.query('select id from public.stops where customer_id = $1 and day = $2', [noTime, tomorrow])).rows[0];
  t0 = TW.sent.length; m0 = mailsTo('notime@example.com').length;
  r = await call('/api/office/move-day', 'POST', { ids: [ns.id], to: day3, forever: true }, owner);
  ok('moving a house that has no time set tells nobody', r.status === 200 && r.d.moved === 1 && TW.sent.length === t0 && mailsTo('notime@example.com').length === m0 && (await msgs(noTime)).length === 0);
  // A whole week rebuilt: only houses with a day and a time hear about a new day.
  t0 = TW.sent.length; m0 = mailBodies.length;
  r = await call('/api/office/week', 'POST', { mode: 'all', apply: true }, owner);
  await settle();
  const timedPhones = new Set((await db.query(`select phone from public.customers where service_time is not null`)).rows.map((x) => '+1' + x.phone));
  ok('a rebuilt week only texts houses whose day and time are set (' + (TW.sent.length - t0) + ' told)', r.status === 200 && TW.sent.slice(t0).every((x) => timedPhones.has(x.to) && /service day is \w+ around \d/.test(x.body)) && (await msgs(noTime)).length === 0, TW.sent.slice(t0).map((x) => x.to));

  // Twilio settings gone: everything waits for a person, as before.
  const keep = { a: env.TWILIO_ACCOUNT_SID };
  const mBefore0 = mailsTo('joe-test@example.com').length;
  delete env.TWILIO_ACCOUNT_SID; t0 = TW.sent.length;
  r = await call('/api/office/customer', 'POST', { id: joe, service_day: otherDay }, owner);
  ok('with no Twilio settings the customer card tells nobody about a day and time', TW.sent.length === t0 && r.d.told.off === true && r.d.told.mailed === false && mailsTo('joe-test@example.com').length === mBefore0, r.d.told);
  r = await call('/api/office/text/send', 'POST', { id: first1.id }, owner);
  ok('and "Resend text" says to send it by hand', r.status === 400 && /by hand/.test(r.d.error), r.d);
  r = await call('/api/health', 'GET');
  ok('/api/health says texts are off', r.d.texts === false && r.d.textsTest === false, r.d);
  env.TWILIO_ACCOUNT_SID = keep.a;

  // Preplan my days (Joe, Nov 22, 2026): the app plans the booked houses with no day and time. Nothing is saved or sent
  // until the office confirms. Then the confirmation goes out, and tomorrow's customers get their night before email and text.
  console.log('\nPreplan my days');
  {
  const day2 = new Date(Date.parse(today + 'T19:00:00Z') + 2 * 864e5).toISOString().slice(0, 10);
  const wdOf = (d) => new Date(d + 'T19:00:00Z').getUTCDay();
  const parity = (d) => ((Math.floor((Date.parse(d + 'T19:00:00Z') - Date.parse('2026-01-05T19:00:00Z')) / (7 * 864e5)) % 2) + 2) % 2;
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const row = async (id) => (await db.query('select service_day, service_time, first_visit, eow_week, plan from public.customers where id = $1', [id])).rows[0];
  const pA = await mk('pre-a@example.com', 'Ann Alpha', '6235550301', true), pB = await mk('pre-b@example.com', 'Bob Bravo', '6235550302', true);
  const pC = await mk('pre-c@example.com', 'Cy Charlie', '6235550303', true), pD = await mk('pre-d@example.com', 'Di Delta', '6235550304', false), pN = await mk('pre-n@example.com', 'Ned Nopin', '6235550305', true);
  await db.query(`update public.customers set lat = 33.430, lng = -112.554 where id = $1`, [pA]);
  await db.query(`update public.customers set lat = 33.521, lng = -112.476 where id = $1`, [pB]);
  await db.query(`update public.customers set lat = 33.444, lng = -112.396, plan = 'eow' where id = $1`, [pC]);
  await db.query(`update public.customers set lat = 33.474, lng = -112.341 where id = $1`, [pD]);
  await db.query(`update public.customers set lat = null, lng = null where id = $1`, [pN]);
  const mine4 = [pA, pB, pC, pD], pMails = ['pre-a@example.com', 'pre-b@example.com', 'pre-c@example.com', 'pre-d@example.com'], pPhones = ['+16235550301', '+16235550302', '+16235550303', '+16235550304'];
  const mailCount = () => pMails.reduce((n, e) => n + mailsTo(e).length, 0), textCount = () => TW.sent.filter((x) => pPhones.includes(x.to)).length;
  const msgCount = async () => Number((await db.query('select count(*) n from public.messages where customer_id = any($1)', [mine4])).rows[0].n);
  delete env.SMS_TEST_ALLOWLIST; env.NIGHT_RUN_AT = '00:00';
  let mc = mailCount(), tc = textCount();
  r = await call('/api/office/preplan', 'POST', { dates: [] }, owner);
  ok('with no day picked it asks for one', r.status === 400 && /Pick at least one day/.test(r.d.error), r.d);
  r = await call('/api/office/preplan', 'POST', { dates: [tomorrow] }, mt);
  ok('a scooper cannot plan the days', r.status === 403, r.status);
  r = await call('/api/office/preplan', 'POST', { dates: ['2020-01-01', '2099-01-01'] }, owner);
  ok('a day in the past or far off is not a day to plan', r.status === 400, r.d);
  r = await call('/api/office/preplan', 'POST', { dates: [tomorrow] }, owner);
  let yards = r.d.days[0].yards, got = mine4.map((id) => yards.find((y) => y.id === id));
  ok('the plan for one day has every waiting house on it, with a time for each', r.status === 200 && r.d.days.length === 1 && got.every(Boolean) && yards.every((y, i) => /^\d\d:\d\d$/.test(y.time) && (i === 0 || mins(y.time) > mins(yards[i - 1].time))), yards.map((y) => y.time + ' ' + y.name));
  ok('with nothing on that day yet the first house is at 8:00 AM', r.d.days[0].had > 0 || yards[0].time === '08:00', [r.d.days[0].had, yards[0].time]);
  ok('the house with no map pin is listed apart and not planned', r.d.noPin.some((y) => y.id === pN) && !yards.some((y) => y.id === pN));
  ok('it says who would be told: an email for each, and a text for the ones who said yes', r.d.tell.gate === '' && r.d.tell.email >= 4 && r.d.tell.text >= 3 && r.d.tell.tomorrow >= 4 && r.d.tell.nightNow === true, r.d.tell);
  ok('looking at a plan saves nothing and tells nobody', (await row(pA)).service_day === null && (await row(pA)).service_time === null && mailCount() === mc && textCount() === tc && await msgCount() === 0
    && Number((await db.query('select count(*) n from public.stops where customer_id = any($1)', [mine4])).rows[0].n) === 0);
  r = await call('/api/office/preplan', 'POST', { dates: [tomorrow, day2], assign: { [pA]: day2, [pB]: day2, [pC]: tomorrow, [pD]: 'none' } }, owner);
  const d1 = r.d.days.find((d) => d.date === tomorrow), d2 = r.d.days.find((d) => d.date === day2);
  ok('the office moves houses between the days and leaves one out: the plan follows', d2.yards.some((y) => y.id === pA) && d2.yards.some((y) => y.id === pB) && d1.yards.some((y) => y.id === pC) && r.d.none.some((y) => y.id === pD) && !d1.yards.concat(d2.yards).some((y) => y.id === pD));
  // Test mode: confirm it. Only the customer on the test list hears a thing.
  env.SMS_TEST_ALLOWLIST = '623-555-0301';
  mc = mailCount(); tc = textCount();
  r = await call('/api/office/preplan', 'POST', { dates: [tomorrow, day2], start: '09:00', assign: { [pA]: tomorrow, [pB]: day2, [pC]: tomorrow, [pD]: 'none' }, apply: true }, owner);
  await settle();
  const ra = await row(pA), rb = await row(pB), rc = await row(pC), rd = await row(pD);
  ok('confirming saves the day and the time for each house on the plan', r.status === 200 && r.d.applied === true && r.d.done.saved >= 3 && ra.service_day === wdOf(tomorrow) && /^\d\d:\d\d/.test(ra.service_time || '') && rb.service_day === wdOf(day2) && !!rb.service_time && rc.service_day === wdOf(tomorrow), [ra, rb, r.d.done]);
  ok('the first visit is that day, and an every other week house is put on that week', ra.first_visit === tomorrow && rb.first_visit === day2 && rc.eow_week === parity(tomorrow), [ra.first_visit, rc.eow_week]);
  ok('the house that was left out stays unplanned', rd.service_day === null && rd.service_time === null);
  const st1 = (await db.query('select s.customer_id, s.position, s.status from public.stops s where s.day = $1 and s.customer_id = any($2) order by s.position, s.id', [tomorrow, mine4])).rows;
  const st2 = (await db.query('select s.customer_id from public.stops s where s.day = $1 and s.customer_id = any($2)', [day2, mine4])).rows;
  ok('the visits are on the Schedule for those days, with no button to press', st1.length === 2 && st2.length === 1 && st2[0].customer_id === pB, [st1.length, st2.length]);
  const tA = (ra.service_time || '').slice(0, 5), tC = (rc.service_time || '').slice(0, 5);
  ok('the route for that day runs in time order', (mins(tA) < mins(tC)) === (st1[0].customer_id === pA), [tA, tC, st1.map((x) => x.position)]);
  const aTexts = TW.sent.filter((x) => x.to === '+16235550301').slice(-2).map((x) => x.body), aMsgs = await msgs(pA);
  ok('test mode: the customer on the test list gets the day and time by text and by email', aTexts.some((b) => /Your service day is \w+ around \d/.test(b)) && mailsTo('pre-a@example.com').some((m) => /Your service day is/.test(m.subject)), aTexts);
  ok('and, since the evening run has gone by, the night before text and email for tomorrow', aTexts.some((b) => /We will be there tomorrow/.test(b)) && mailsTo('pre-a@example.com').some((m) => /^We will be there tomorrow around/.test(m.subject) && /between/.test(m.text) && /arizonapetwaste\.com\/t\//.test(m.text)) && r.d.done.night && r.d.done.night.emailed >= 1, r.d.done.night);
  ok('the night before email is in the log, once', aMsgs.filter((m) => m.kind === 'night_before' && m.channel === 'email' && m.status === 'sent').length === 1 && aMsgs.filter((m) => m.kind === 'night_before' && m.channel === 'sms').length === 1, aMsgs.map((m) => m.kind + ' ' + m.channel));
  ok('test mode: the customers who are not on the test list get nothing at all', textCount() - tc === 2 && mailCount() - mc === 2 && (await msgs(pB)).length === 0 && (await msgs(pC)).every((m) => m.kind === 'night_before' && m.channel === 'sms' && m.status === 'queued'), [textCount() - tc, mailCount() - mc, (await msgs(pC)).map((m) => m.kind + ' ' + m.channel + ' ' + m.status)]);
  const nMail = mailsTo('pre-a@example.com').length, nText = textCount();
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  ok('the evening run after that sends tomorrow\'s customers no second email and no second text', r.status === 200 && mailsTo('pre-a@example.com').length === nMail && textCount() === nText && r.d.emailed === 0, r.d);
  // Test mode off. The house left out is planned now, for tomorrow, with the evening run still ahead.
  delete env.SMS_TEST_ALLOWLIST; env.NIGHT_RUN_AT = '23:59';
  mc = mailsTo('pre-d@example.com').length; tc = TW.sent.filter((x) => x.to === '+16235550304').length;
  r = await call('/api/office/preplan', 'POST', { dates: [tomorrow], apply: true }, owner);
  await settle();
  ok('a house added to a day that has yards goes after the last one, and nobody already set is moved', r.status === 200 && (await row(pA)).service_time.slice(0, 5) === tA && mins((await row(pD)).service_time.slice(0, 5)) > Math.max(mins(tA), mins(tC)), [(await row(pD)).service_time, tA, tC]);
  ok('a customer who said no to texts gets the email and no text', mailsTo('pre-d@example.com').length - mc === 1 && TW.sent.filter((x) => x.to === '+16235550304').length === tc && !(await msgs(pD)).some((m) => m.channel === 'sms'));
  ok('before the evening run, confirming sends no night before message: the evening run does that', r.d.done.night === null && !(await msgs(pD)).some((m) => m.kind === 'night_before'), r.d.done);
  r = await call('/api/office/night-before', 'POST', {}, null, { 'x-cron-secret': env.CRON_SECRET });
  const dMsgs = await msgs(pD);
  ok('the evening run sends the night before email to a customer with no texts too', r.status === 200 && r.d.emailed >= 1 && dMsgs.filter((m) => m.kind === 'night_before' && m.channel === 'email').length === 1 && mailsTo('pre-d@example.com').some((m) => /^We will be there tomorrow/.test(m.subject)), r.d);
  r = await call('/api/office/preplan', 'POST', { dates: [tomorrow] }, owner);
  ok('a planned house is off the waiting list, so a second plan does not touch it', !r.d.days[0].yards.some((y) => mine4.includes(y.id)));
  // Twilio off: the plan is still saved and nobody is told.
  const pE = await mk('pre-e@example.com', 'Eve Echo', '6235550306', true);
  delete env.TWILIO_ACCOUNT_SID; tc = TW.sent.length;
  r = await call('/api/office/preplan', 'POST', { dates: [day2], apply: true }, owner);
  await settle();
  ok('with texts not switched on the plan is saved and no customer is told', r.status === 200 && r.d.tell.gate === 'off' && (await row(pE)).service_day === wdOf(day2) && TW.sent.length === tc && mailsTo('pre-e@example.com').length === 0, r.d.tell);
  env.TWILIO_ACCOUNT_SID = keep.a;

  // The Schedule builds a day when it is opened, so a house shows on its day with no button to press.
  console.log('\nThe Schedule builds itself');
  const day4 = new Date(Date.parse(today + 'T19:00:00Z') + 4 * 864e5).toISOString().slice(0, 10), past = new Date(Date.parse(today + 'T19:00:00Z') - 3 * 864e5).toISOString().slice(0, 10);
  const pF = await mk('pre-f@example.com', 'Flo Foxtrot', '6235550307', true);
  await db.query(`update public.customers set service_day = $1, service_time = '10:15' where id = $2`, [wdOf(day4), pF]);
  tc = TW.sent.length; mc = mailBodies.length;
  r = await call('/api/office/day?date=' + day4, 'GET', null, owner);
  ok('a plain look at a day builds nothing (the screen refresh)', !r.d.stops.some((x) => x.customer.id === pF));
  r = await call('/api/office/day?build=1&date=' + day4, 'GET', null, owner);
  ok('opening a day on the Schedule shows the house set for that weekday, with its time', r.status === 200 && r.d.stops.some((x) => x.customer.id === pF && r.d.times[x.id] === '10:15'), r.d.stops.length);
  r = await call('/api/office/day?build=1&date=' + day4, 'GET', null, owner);
  ok('opening it again adds nothing twice', r.d.stops.filter((x) => x.customer.id === pF).length === 1);
  ok('building a day emails and texts nobody', TW.sent.length === tc && mailBodies.length === mc && (await msgs(pF)).length === 0);
  await db.query(`update public.customers set service_day = $1 where id = $2`, [wdOf(past), pF]);
  r = await call('/api/office/day?build=1&date=' + past, 'GET', null, owner);
  ok('a day that is over is never built', !r.d.stops.some((x) => x.customer.id === pF));
  delete env.NIGHT_RUN_AT;
  }
}

console.log('\n' + pass + ' passed, ' + failN + ' failed');
await db.end();
globalThis.fetch = realFetch;
process.exit(failN ? 1 : 0);

// Week planner checks. No database needed: node build/week.test.mjs
// Town days ("today is a Buckeye day"), the daily limit, twice a week gaps, and 300 random weeks.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = path.join(os.tmpdir(), 'apw-week-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, 'src/worker/worker.js'), 'utf8') + '\nexport { weekPlan, nearSlot, shortOrder, pathMiles, miles, ZIPS };\n');
const W = await import(tmp);
fs.unlinkSync(tmp);
let pass = 0, fail = 0;
const ok = (name, good, info) => { if (good) pass++; else fail++; console.log((good ? '  ok   ' : '  FAIL ') + name + (info !== undefined ? '  ' + info : '')); };
const BOX = { '85326': [33.36, 33.44, -112.62, -112.50], '85396': [33.47, 33.52, -112.54, -112.47], '85338': [33.40, 33.46, -112.42, -112.34], '85395': [33.46, 33.50, -112.42, -112.36], '85340': [33.48, 33.52, -112.38, -112.33], '85355': [33.54, 33.60, -112.48, -112.40] };
let seed = 1, ids = 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const mk = (zip, n, plans = ['week']) => Array.from({ length: n }, (_, i) => { const b = BOX[zip]; return { id: 'y' + (++ids), zip, plan: plans[i % plans.length], lat: b[0] + rnd() * (b[1] - b[0]), lng: b[2] + rnd() * (b[3] - b[2]) }; });
const MIX = ['week', 'week', 'week', 'eow', 'twice'];
const mix = (n) => [['85326', 0.3], ['85396', 0.16], ['85338', 0.2], ['85395', 0.14], ['85340', 0.1], ['85355', 0.1]].flatMap(([z, s]) => mk(z, Math.round(n * s), MIX));
const area = (c) => W.ZIPS[c.zip].area;
// The real days a plan makes: for each scooper and weekday, the yards in week A and in week B.
function look(list, p, cap, days) {
  const by = {}; let bad = 0;
  for (const c of list) {
    const a = p.set[c.id];
    if (!a) { bad++; continue; }
    if (a.service_day2 != null && (a.service_day2 === a.service_day || Math.abs(a.service_day - a.service_day2) < 2)) bad++;
    if (c.plan === 'twice' && days.length > 1 && a.service_day2 == null) bad++;
    for (const d of [a.service_day, a.service_day2]) { if (d == null) continue; if (!days.includes(d)) bad++; (by[a.t + '|' + d] = by[a.t + '|' + d] || []).push(Object.assign({}, c, { eow_week: a.eow_week })); }
  }
  const dayList = Object.values(by);
  const size = (v) => Math.max(v.filter((c) => c.plan !== 'eow' || c.eow_week === 0).length, v.filter((c) => c.plan !== 'eow' || c.eow_week === 1).length);
  return { bad, days: dayList, most: Math.max(0, ...dayList.map(size)), least: Math.min(...dayList.map(size)), mixed: dayList.filter((v) => new Set(v.map(area)).size > 1).length,
    miles: dayList.reduce((n, v) => n + W.pathMiles(W.shortOrder(v, null)), 0) };
}
const WEEK = [1, 2, 3, 4, 5];

console.log('Joe\'s case: 20 yards in Buckeye and 10 in Litchfield Park, one scooper');
for (const cap of [20, 30, 40]) {
  seed = 11;
  const list = [...mk('85326', 20), ...mk('85340', 10)], p = W.weekPlan(list, [], cap, WEEK), L = look(list, p, cap, WEEK);
  ok('limit ' + cap + ': a Buckeye day and a Litchfield Park day, no mixed day', L.days.length === 2 && L.mixed === 0 && L.bad === 0, L.days.map((v) => v.length + ' ' + area(v[0])).join(', '));
  ok('limit ' + cap + ': no day over the limit', L.most <= cap, L.most);
  const oneDay = W.pathMiles(W.shortOrder(list, null));
  ok('limit ' + cap + ': town days drive less than one mixed day', L.miles < oneDay, Math.round(L.miles) + ' mi against ' + Math.round(oneDay));
  ok('limit ' + cap + ': the plan names the town for each day', p.slots.every((s) => s.towns === 'Buckeye' || s.towns === 'Litchfield Park'), p.slots.map((s) => s.dayName + ' ' + s.towns).join(', '));
}

console.log('\nOne tight town does not get split into thin days');
seed = 3;
{ const list = mk('85340', 24), p = W.weekPlan(list, [], 30, WEEK), L = look(list, p, 30, WEEK); ok('24 yards in one town with a limit of 30 is one day', L.days.length === 1 && L.most === 24, L.days.length + ' days'); }
seed = 4;
{ const list = [...mk('85326', 12), ...mk('85355', 2)], p = W.weekPlan(list, [], 30, WEEK), L = look(list, p, 30, WEEK); ok('no day with fewer than 5 yards when the week has more', L.least >= 5, 'smallest day ' + L.least); }

console.log('\nBigger weeks, mixed plans (weekly, every other week, twice a week)');
for (const n of [60, 100, 250, 500, 1000]) for (const cap of [20, 30, 40]) {
  seed = 7;
  const list = mix(n), t0 = Date.now(), p = W.weekPlan(list, [], cap, WEEK), ms = Date.now() - t0, L = look(list, p, cap, WEEK);
  ok(n + ' yards, limit ' + cap + ': every yard placed, no day over the limit, twice a week gaps kept', L.bad === 0 && L.most <= cap, 'biggest day ' + L.most + ', ' + p.techs + ' scoopers, ' + Math.round(L.miles) + ' mi, ' + ms + ' ms');
  ok(n + ' yards, limit ' + cap + ': plans in under 2 seconds', ms < 2000, ms + ' ms');
}

console.log('\n300 random weeks');
{
  let broke = 0;
  for (let s = 1; s <= 300; s++) {
    seed = s * 97;
    const n = 5 + Math.floor(rnd() * 400), cap = [20, 25, 30, 35, 40][s % 5], days = s % 3 ? WEEK : [1, 2, 3, 4, 5, 6], list = mix(n), L = look(list, W.weekPlan(list, [], cap, days), cap, days);
    if (L.bad || L.most > cap) broke++;
  }
  ok('300 random weeks (5 to 405 yards, limits 20 to 40, 5 and 6 day weeks): none breaks a rule', broke === 0, broke + ' broke');
}

console.log('\nA new sign up joins close yards only while the day has room');
{
  seed = 21;
  const full = mk('85340', 30).map((c) => Object.assign(c, { service_day: 2, scooper_id: 's1' })), pin = mk('85340', 1)[0];
  ok('a full day (30 of 30) is not offered', W.nearSlot(full, pin, 'week', 30, WEEK) === null);
  const slot = W.nearSlot(full.slice(0, 29), pin, 'week', 30, WEEK);
  ok('a day with room (29 of 30) is offered', slot && slot.service_day === 2 && slot.scooper_id === 's1');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

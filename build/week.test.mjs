// Week planner checks. No database needed: node build/week.test.mjs
// Town days ("today is a Buckeye day"), the daily limit, twice a week gaps, and 300 random weeks.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = path.join(os.tmpdir(), 'apw-week-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, 'src/worker/worker.js'), 'utf8') + '\nexport { weekPlan, nearSlot, shortOrder, pathMiles, miles, ZIPS, prePlan };\n');
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

console.log('\nMore than one scooper: each gets one part of town');
for (const [n, team] of [[100, 1], [250, 3], [330, 3], [450, 4], [500, 4]]) {
  seed = 7 + n;
  const staff = Array.from({ length: team }, (_, i) => ({ id: 's' + (i + 1), name: ['Juan', 'Sam', 'Alex', 'Riley'][i] }));
  const list = mix(n), p = W.weekPlan(list, staff, 30, WEEK), L = look(list, p, 30, WEEK);
  const per = {}; for (const c of list) (per[p.set[c.id].scooper_id || 'open'] = per[p.set[c.id].scooper_id || 'open'] || []).push(c);
  const names = Object.keys(per), work = names.map((k) => per[k].reduce((x, c) => x + (c.plan === 'twice' ? 2 : c.plan === 'eow' ? 0.5 : 1), 0));
  ok(n + ' yards, ' + team + ' on the team: every yard has a scooper or an open route, no day over 30', L.bad === 0 && L.most <= 30, names.map((k, i) => k + ' ' + per[k].length).join(', '));
  ok(n + ' yards, ' + team + ' on the team: the plan says how many scoopers it takes', p.techs === names.length && p.techs >= Math.ceil(work.reduce((a, b) => a + b, 0) / 150), p.techs + ' needed');
  if (names.length > 1) {
    ok(n + ' yards: the work is shared about evenly', Math.max(...work) - Math.min(...work) <= 0.25 * Math.max(...work) + 4, work.map((x) => Math.round(x)).join(' / '));
    // Each scooper's yards sit closer to their own middle than to anyone else's middle, most of the time.
    const mid = Object.fromEntries(names.map((k) => [k, { lat: per[k].reduce((x, c) => x + c.lat, 0) / per[k].length, lng: per[k].reduce((x, c) => x + c.lng, 0) / per[k].length }]));
    const home = list.filter((c) => { const me = p.set[c.id].scooper_id || 'open'; return names.every((k) => W.miles(c, mid[me]) <= W.miles(c, mid[k]) + 2); }).length;
    ok(n + ' yards: scoopers keep to their own part of town', home / list.length >= 0.85, Math.round(100 * home / list.length) + ' percent of yards sit in their own scooper\'s area');
    const days = {}; for (const s of p.slots) days[s.name + '|' + s.day] = (days[s.name + '|' + s.day] || 0) + 1;
    ok(n + ' yards: one route for each scooper each day', Object.values(days).every((x) => x === 1));
  }
}
{
  seed = 5;
  const list = mix(40), p = W.weekPlan(list, [{ id: 'juan', name: 'Juan' }, { id: 's2', name: 'Sam' }, { id: 's3', name: 'Alex' }], 30, WEEK);
  ok('40 yards with 3 on the team stays one scooper (Juan), nobody drives for a handful of yards', p.techs === 1 && list.every((c) => p.set[c.id].scooper_id === 'juan'), p.techs + ' used');
  const q = W.weekPlan(mix(400), [{ id: 'juan', name: 'Juan' }], 30, WEEK);
  ok('400 yards with only Juan: the plan opens extra routes and says to hire, it does not overload him', q.techs > 1 && q.slots.filter((s) => s.staffId === 'juan').every((s) => s.yards <= 30) && q.slots.some((s) => /^Open route/.test(s.name)), q.techs + ' scoopers needed');
}

console.log('\nWhere the truck starts');
{
  seed = 11;
  const list = [...mk('85326', 20), ...mk('85340', 10)], start = { lat: 33.4950, lng: -112.5050 };
  const a = W.weekPlan(list, [], 30, WEEK), b = W.weekPlan(list, [], 30, WEEK, start), sum = (p) => p.slots.reduce((x, s) => x + s.miles, 0);
  ok('with a start, miles count the drive out and the drive home', sum(b) > sum(a), Math.round(sum(a)) + ' mi with no start, ' + Math.round(sum(b)) + ' mi from the start');
  const L = look(list, b, 30, WEEK);
  ok('with a start, still town days and no day over the limit', L.mixed === 0 && L.most <= 30 && L.bad === 0, L.days.length + ' days');
  let broke = 0;
  for (let s = 1; s <= 100; s++) { seed = s * 131; const n = 5 + Math.floor(rnd() * 300), cap = [20, 30, 40][s % 3], l2 = mix(n), L2 = look(l2, W.weekPlan(l2, [], cap, WEEK, start), cap, WEEK); if (L2.bad || L2.most > cap) broke++; }
  ok('100 random weeks with a start: none breaks a rule', broke === 0, broke + ' broke');
}

console.log('\nThe map data for each day');
{
  seed = 9;
  const list = mix(100), p = W.weekPlan(list, [], 30, WEEK);
  const seen = {}; for (const s of p.slots) for (const pt of s.pts) seen[pt[2]] = (seen[pt[2]] || 0) + 1;
  ok('every day lists its yards in driving order for the map', p.slots.every((s) => Array.isArray(s.pts) && s.pts.length === s.homes));
  ok('every yard shows up on the map, twice a week yards on two days', list.every((c) => seen[c.id] === (c.plan === 'twice' ? 2 : 1)));
}

console.log('\nA new sign up joins close yards only while the day has room');
{
  seed = 21;
  const full = mk('85340', 30).map((c) => Object.assign(c, { service_day: 2, scooper_id: 's1' })), pin = mk('85340', 1)[0];
  ok('a full day (30 of 30) is not offered', W.nearSlot(full, pin, 'week', 30, WEEK) === null);
  const slot = W.nearSlot(full.slice(0, 29), pin, 'week', 30, WEEK);
  ok('a day with room (29 of 30) is offered', slot && slot.service_day === 2 && slot.scooper_id === 's1');
}
// Preplan my days (Joe, Nov 22, 2026): the houses with no day and time are put on the days the office picked.
console.log('\nPreplan my days');
{
  const six = [['Lopez', 33.5212, -112.4766], ['Means', 33.4444, -112.3962], ['Cunningham', 33.4748, -112.3415], ['Dan', 33.5169, -112.4396], ['Wyche', 33.4308, -112.5542], ['Arbo', 33.5646, -112.4507]]
    .map((x, i) => ({ id: 'p' + i, name: x[0], lat: x[1], lng: x[2], first: true }));
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const rising = (d) => d.yards.every((y, i) => i === 0 || mins(y.time) > mins(d.yards[i - 1].time));
  let p = W.prePlan(six, ['2026-11-23'], {});
  ok('one day: all six houses are on it', p.days.length === 1 && p.days[0].yards.length === 6 && !p.none.length && !p.noPin.length);
  ok('the first house is at 8:00 AM and every time after is later', p.days[0].yards[0].time === '08:00' && rising(p.days[0]), p.days[0].yards.map((y) => y.time).join(' '));
  ok('times are on the five minutes, and a first visit gets its 20 minutes plus the drive', p.days[0].yards.every((y) => mins(y.time) % 5 === 0) && mins(p.days[0].yards[1].time) - mins(p.days[0].yards[0].time) >= 21);
  ok('the day is in a short driving order (under 40 miles for these six)', p.days[0].miles > 0 && p.days[0].miles < 40, p.days[0].miles);
  p = W.prePlan(six, ['2026-11-23'], { start: '10:30' });
  ok('the office picks the first time', p.days[0].yards[0].time === '10:30');
  p = W.prePlan(six, ['2026-11-24', '2026-11-23'], {});
  ok('two days: every house is on one of them, and each day starts at 8:00 AM', p.days.map((d) => d.date).join() === '2026-11-23,2026-11-24' && p.days[0].yards.length + p.days[1].yards.length === 6 && p.days.every((d) => d.yards.length >= 2 && d.yards[0].time === '08:00' && rising(d)), p.days.map((d) => d.yards.length));
  const one = W.prePlan(six, ['2026-11-23'], {}).days[0].miles;
  ok('two days keep neighbors together: the two routes add up to fewer miles than the one long day', p.days[0].miles + p.days[1].miles < one, [p.days[0].miles, p.days[1].miles, one]);
  p = W.prePlan(six, ['2026-11-23', '2026-11-24'], { assign: { p0: '2026-11-24', p1: '2026-11-24', p2: '2026-11-24', p3: '2026-11-24', p4: '2026-11-23', p5: 'none' } });
  ok('the office moves houses and that wins: four on Tuesday, one on Monday, one left out', p.days[0].yards.map((y) => y.c.id).join() === 'p4' && p.days[1].yards.length === 4 && p.none.map((c) => c.id).join() === 'p5');
  p = W.prePlan(six.concat([{ id: 'nopin', name: 'No Pin', lat: null, lng: null }]), ['2026-11-23'], {});
  ok('a house that is not on the map is not planned, and is listed', p.noPin.length === 1 && p.days[0].yards.length === 6);
  p = W.prePlan(six, ['2026-11-23'], { busy: { '2026-11-23': [{ lat: 33.5, lng: -112.4, time: '09:00' }, { lat: 33.5, lng: -112.41, time: '13:15' }] } });
  ok('a day that already has yards: they keep their times and the new houses go after the last one', p.days[0].had === 2 && mins(p.days[0].yards[0].time) >= 13 * 60 + 25 && rising(p.days[0]), p.days[0].yards.map((y) => y.time).join(' '));
  p = W.prePlan(six, ['2026-11-23'], { cap: 4 });
  ok('a day over the daily limit is flagged, not hidden', p.days[0].over === true);
  p = W.prePlan(six, ['2026-11-23'], { start: '17:00' });
  ok('a day that runs past 6 PM is flagged', p.days[0].late === true, p.days[0].ends);
  p = W.prePlan([], ['2026-11-23'], {});
  ok('no houses to plan is an empty day, not a crash', p.days[0].yards.length === 0 && p.days[0].ends === null);
  const big = mix(200).map((c) => Object.assign(c, { first: false }));
  p = W.prePlan(big, ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'], { cap: 45 });
  const sizes = p.days.map((d) => d.yards.length);
  ok('200 houses over five days: all placed, no day over the limit of 45 and none under 24 (' + sizes.join(', ') + ')', sizes.reduce((a, b) => a + b, 0) === big.length && Math.max(...sizes) <= 45 && Math.min(...sizes) >= 24 && p.days.every((d) => rising(d) && !d.over));
  p = W.prePlan(big, ['2026-11-23', '2026-11-24'], { cap: 30 });
  ok('more houses than the days can hold: every house is still placed and the days say they are over', p.days[0].yards.length + p.days[1].yards.length === big.length && p.days.every((d) => d.over));
  const t0 = Date.now(); W.prePlan(mix(1000), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'], { cap: 150 });
  ok('1,000 houses plan in under 5 seconds (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 5000);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// Prices live in one file: src/prices.json (Joe, Nov 18, 2026).
// The server (src/worker/worker.js) ships as one file with nothing to load, so it carries a copy of the numbers
// between two marks. This script writes that copy. `npm run build` runs it first, and `node build/worker.test.mjs`
// fails if the copy and the file ever differ. So: change src/prices.json, never the copy.
//   node build/prices.mjs          writes the copy into the server file and says if anything changed
//   node build/prices.mjs --check  changes nothing and fails if the copy is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'src/prices.json');
const WORKER = path.join(ROOT, 'src/worker/worker.js');
export const PLAN_IDS = ['week', 'twice', 'eow'];
const START = '/* PRICES:START (a copy of src/prices.json, written by build/prices.mjs. Change that file, never this block.) */';
const END = '/* PRICES:END */';

// Reads the file and refuses numbers that cannot be prices, so a typing slip never reaches Stripe.
export function loadPrices() {
  const p = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const table = (t, what) => {
    for (const id of PLAN_IDS) {
      const row = t && t[id];
      if (!Array.isArray(row) || row.length !== 6) throw new Error('src/prices.json: ' + what + '.' + id + ' needs six prices, for 1 to 6 dogs');
      row.forEach((n, i) => {
        if (!(Number.isFinite(n) && n >= 20 && n <= 2000 && Math.round(n * 100) === n * 100)) throw new Error('src/prices.json: ' + what + '.' + id + ' has a bad price for ' + (i + 1) + ' dogs: ' + n);
        if (i && n < row[i - 1]) throw new Error('src/prices.json: ' + what + '.' + id + ' goes down from ' + i + ' to ' + (i + 1) + ' dogs');
      });
    }
  };
  table(p.month, 'month');
  table(p.kept && p.kept.month, 'kept.month');
  if (!(p.once >= 20 && p.once <= 2000)) throw new Error('src/prices.json: once is not a price');
  if (!Array.isArray(p.kept.plans) || p.kept.plans.some((x) => !/^sub_[A-Za-z0-9]{8,}$/.test(x))) throw new Error('src/prices.json: kept.plans must be Stripe plan ids (sub_...)');
  return p;
}
// What the server needs, and no more: the two tables and the list of plans that keep the older prices.
export function serverCopy(p) {
  const pick = (t) => Object.fromEntries(PLAN_IDS.map((id) => [id, t[id]]));
  return { month: pick(p.month), once: p.once, kept: { plans: p.kept.plans, month: pick(p.kept.month) } };
}
export function workerBlock(p) { return START + '\nconst PRICES = ' + JSON.stringify(serverCopy(p)) + ';\n' + END; }
export function workerHas(src) {
  const a = src.indexOf(START), b = src.indexOf(END);
  return a >= 0 && b > a ? src.slice(a, b + END.length) : null;
}
// Writes the copy. Returns true when the server file changed.
export function syncPrices() {
  const src = fs.readFileSync(WORKER, 'utf8');
  const now = workerHas(src), want = workerBlock(loadPrices());
  if (now === null) throw new Error('src/worker/worker.js has no PRICES block to fill');
  if (now === want) return false;
  fs.writeFileSync(WORKER, src.replace(now, want));
  return true;
}
// Helpers the build uses for the words on the site.
export const monthOf = (p, plan, dogs) => p.month[plan][Math.min(6, Math.max(1, dogs)) - 1];
export const weekOf = (p, plan, dogs) => Math.round(monthOf(p, plan, dogs) * 12 / 52);
export const usd = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const ok = workerHas(fs.readFileSync(WORKER, 'utf8')) === workerBlock(loadPrices());
    console.log(ok ? 'The server has the prices in src/prices.json.' : 'The server copy is out of date. Run: node build/prices.mjs');
    process.exit(ok ? 0 : 1);
  }
  console.log(syncPrices() ? 'Wrote the prices from src/prices.json into src/worker/worker.js.' : 'The server already has the prices in src/prices.json.');
}

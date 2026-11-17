// Runs dist/ on this computer the way Cloudflare Pages runs it: static files with the rules in _headers and
// _redirects, and the server (_worker.js) for the paths in _routes.json. Use it to test the crew app in a real
// browser under the same security headers the live site sends.
//   npm run build && node build/serve.mjs            (http://127.0.0.1:8788)
//   PORT=9000 node build/serve.mjs
// No keys are set, so the server answers like a site with no database: /crew/?demo and /t/DEMO01 work, sign in does not.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, process.env.OUT_DIR || 'dist');
const PORT = Number(process.env.PORT || 8788);
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', mp4: 'video/mp4', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json' };

// _headers: a path line, then indented "Name: value" lines. Every rule that matches adds its headers. The same header from two rules is joined with a comma, as Cloudflare does.
const rules = [];
for (const line of fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] });
  else { const i = line.indexOf(':'); rules[rules.length - 1].headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
}
const glob = (p) => new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
function headersFor(pathname) {
  const out = {};
  for (const r of rules) if (glob(r.pattern).test(pathname)) for (const [k, v] of r.headers) { const key = k.toLowerCase(); out[key] = out[key] ? out[key] + ', ' + v : v; }
  return out;
}
const redirects = fs.readFileSync(path.join(DIST, '_redirects'), 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).filter((x) => x.length >= 2 && !x[0].includes('*'));
const routes = JSON.parse(fs.readFileSync(path.join(DIST, '_routes.json'), 'utf8'));
const inRoutes = (p) => routes.include.some((x) => glob(x).test(p)) && !(routes.exclude || []).some((x) => glob(x).test(p));

function asset(pathname) {
  const red = redirects.find((r) => r[0] === pathname);
  if (red) return new Response(null, { status: Number(red[2] || 302), headers: { location: red[1] } });
  let file = path.join(DIST, decodeURIComponent(pathname));
  if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!pathname.endsWith('/')) return new Response(null, { status: 308, headers: { location: pathname + '/' } });
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) { const nf = path.join(DIST, '404.html'); return new Response(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found', { status: 404, headers: { 'content-type': TYPES.html } }); }
  const h = headersFor(pathname);
  h['content-type'] = TYPES[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
  return new Response(fs.readFileSync(file), { status: 200, headers: h });
}
const worker = (await import(pathToFileURL(path.join(DIST, '_worker.js')).href)).default;
const env = { ASSETS: { fetch: async (req) => asset(new URL(req.url).pathname) } };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
    const chunks = []; for await (const c of req) chunks.push(c);
    const init = { method: req.method, headers: Object.assign({}, req.headers, { 'cf-connecting-ip': req.socket.remoteAddress || '127.0.0.1' }) };
    if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const out = inRoutes(url.pathname) ? await worker.fetch(new Request(url, init), env, { waitUntil() { } }) : asset(url.pathname);
    const headers = {}; out.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(out.status, headers);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
}).listen(PORT, '127.0.0.1', () => console.log('dist is up at http://127.0.0.1:' + PORT + ' with ' + rules.length + ' header rules'));

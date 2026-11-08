// Launch checks on dist/: one H1, titles and descriptions, no dashes in what people read, working links, valid structured data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p);
  }
})(DIST);

const routes = new Set(pages.map((p) => '/' + path.relative(DIST, p).replace(/index\.html$/, '').replace(/\\/g, '/')));
const DASH = /[-‐-―−]/;
let problems = 0;
const bad = (page, msg) => { problems++; console.log('  x', page, msg); };

for (const file of pages) {
  const rel = '/' + path.relative(DIST, file).replace(/index\.html$/, '');
  const html = fs.readFileSync(file, 'utf8');
  const doc = new JSDOM(html).window.document;
  const title = doc.title, desc = (doc.querySelector('meta[name=description]') || {}).content || '';
  const noindex = /noindex/.test((doc.querySelector('meta[name=robots]') || {}).content || '');
  const h1s = doc.querySelectorAll('h1');
  if (h1s.length !== 1) bad(rel, h1s.length + ' h1 tags');
  if (!noindex && title.length > 62) bad(rel, 'title is ' + title.length + ' characters');
  if (!noindex && (desc.length < 110 || desc.length > 165)) bad(rel, 'description is ' + desc.length + ' characters');
  if (!noindex && !doc.querySelector('link[rel=canonical]')) bad(rel, 'no canonical');
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { JSON.parse(s.textContent); } catch (e) { bad(rel, 'structured data does not parse'); }
  }
  doc.querySelectorAll('script,style,noscript,svg text').forEach((n) => n.remove());
  const words = doc.body.textContent.replace(/\s+/g, ' ');
  const hit = words.match(new RegExp('.{0,30}' + DASH.source + '.{0,30}'));
  if (hit) bad(rel, 'dash in visible text: "' + hit[0] + '"');
  for (const el of doc.querySelectorAll('[alt],[aria-label],[placeholder],[title]')) {
    for (const a of ['alt', 'aria-label', 'placeholder', 'title']) {
      const v = el.getAttribute(a);
      if (v && DASH.test(v)) bad(rel, 'dash in ' + a + ': "' + v + '"');
    }
  }
  for (const a of doc.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (!h.startsWith('/') || h.startsWith('//')) continue;
    const p = h.split('#')[0].split('?')[0];
    if (p.startsWith('/assets/') || p === '/favicon.ico') { if (!fs.existsSync(path.join(DIST, p))) bad(rel, 'missing file ' + p); continue; }
    if (!routes.has(p)) bad(rel, 'link to missing page ' + h);
  }
  const ids = new Set([...doc.querySelectorAll('[id]')].map((x) => x.id));
  for (const a of doc.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute('href').slice(1);
    if (id && !ids.has(id)) bad(rel, 'anchor #' + id + ' has no target');
  }
  console.log((noindex ? 'noindex ' : 'index   ') + rel.padEnd(18) + ' ' + title);
}
console.log(problems ? '\n' + problems + ' problems' : '\nAll checks passed.');
process.exit(problems ? 1 : 0);

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
const indexable = new Set();

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
  // headings go in order: never skip a level going down (h2 then h4 is a skip)
  let last = 0;
  for (const h of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const lv = +h.tagName[1];
    if (last && lv > last + 1) bad(rel, 'heading skips from h' + last + ' to h' + lv + ': "' + h.textContent.trim().slice(0, 40) + '"');
    if (!h.textContent.trim()) bad(rel, 'empty h' + lv);
    last = lv;
  }
  // the look (Nov 2026 redesign): public pages use our own font file, and headings carry no decoration.
  // The crew app, the truck link and the staff page are their own files and are not checked here.
  if (doc.querySelector('#app[data-board]')) {
    if (/fonts\.(googleapis|gstatic)\.com/.test(html)) bad(rel, 'loads a font from Google (the font is our own file in /assets/fonts/)');
    if (/IBM Plex Mono|Schibsted Grotesk/.test(html)) bad(rel, 'names a font we no longer use');
    if (/<span style="color: var\(--accent\);">[.?]<\/span>|<span class="dot">/.test(html)) bad(rel, 'colored period after a heading');
    if (!/rel="preload" href="\/assets\/fonts\//.test(html)) bad(rel, 'does not preload the font');
  }
  // every image says what it is (alt="" is fine for pictures that are only decoration)
  for (const img of doc.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) bad(rel, 'image with no alt: ' + (img.getAttribute('src') || '').slice(0, 60));
  }
  if (!noindex) indexable.add(rel);
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
    if (/^\/t\/[A-Za-z0-9]+$/.test(p)) continue; // truck links are served by the worker
    if (!routes.has(p)) bad(rel, 'link to missing page ' + h);
  }
  const ids = new Set([...doc.querySelectorAll('[id]')].map((x) => x.id));
  for (const a of doc.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute('href').slice(1);
    if (id && !ids.has(id)) bad(rel, 'anchor #' + id + ' has no target');
  }
  console.log((noindex ? 'noindex ' : 'index   ') + rel.padEnd(18) + ' ' + title);
}
// the sitemap lists every page we want in Google, and nothing else
{
  const sm = fs.existsSync(path.join(DIST, 'sitemap.xml')) ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8') : '';
  if (!sm) bad('/sitemap.xml', 'missing');
  const locs = new Set([...sm.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1]));
  for (const r of indexable) if (!locs.has(r)) bad('/sitemap.xml', 'does not list ' + r);
  for (const r of locs) if (!indexable.has(r)) bad('/sitemap.xml', 'lists ' + r + ' which is not an indexable page');
  const robots = fs.existsSync(path.join(DIST, 'robots.txt')) ? fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8') : '';
  if (!/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m.test(robots)) bad('/robots.txt', 'no Sitemap line');
  console.log('sitemap  ' + locs.size + ' pages');
}
console.log(problems ? '\n' + problems + ' problems' : '\nAll checks passed.');
process.exit(problems ? 1 : 0);

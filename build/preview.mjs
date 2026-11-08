// Makes a copy of dist/ that works as a claude.ai artifact preview: relative links, a <base> tag on inner pages, no server files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'preview');
fs.rmSync(OUT, { recursive: true, force: true });
const SKIP = new Set(['_worker.js', '_routes.json', '_headers', '_redirects']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (!SKIP.has(e.name)) files.push(p);
  }
})(DIST);

const BS = '\\';
// In HTML an attribute reads href="/x/". Inside the page scripts (JSON strings) it reads href=\"/x/\".
function fixLinks(s, inScript) {
  const q = inScript ? BS + '"' : '"';
  const re = new RegExp('(href|src)=' + (inScript ? '\\\\"' : '"') + '/(?!/)([^"\\\\#?]*)', 'g');
  return s.replace(re, (m, attr, p) => {
    let to = p;
    if (to === '' || to.endsWith('/')) to += 'index.html';
    return attr + '=' + q + to;
  });
}

for (const f of files) {
  const rel = path.relative(DIST, f);
  const out = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (f.endsWith('.html')) {
    const depth = rel.split(path.sep).length - 1;
    let html = fs.readFileSync(f, 'utf8');
    if (depth) html = html.replace('<head>', '<head>\n<base href="' + '../'.repeat(depth) + '">');
    fs.writeFileSync(out, fixLinks(html, false));
  } else if (f.endsWith('.js') && rel.startsWith('assets')) {
    fs.writeFileSync(out, fixLinks(fs.readFileSync(f, 'utf8'), true));
  } else fs.copyFileSync(f, out);
}
console.log(files.length, 'files in', OUT);

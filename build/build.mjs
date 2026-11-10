// Builds the Arizona Pet Waste website into dist/.
// Every page is rendered to real HTML here (for Google, AI search and fast first paint), then the same templates run in the browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import * as BIZ from './biz.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, process.env.OUT_DIR || 'dist');
const DC = vm.runInThisContext('(function(){var module={exports:{}};' + fs.readFileSync(path.join(SRC, 'runtime/dc.js'), 'utf8') + '\nreturn module.exports;})()');

const cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'site.config.json'), 'utf8'));
const ORIGIN = (process.env.SITE_ORIGIN || cfg.origin).replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
const board = (id) => JSON.parse(fs.readFileSync(path.join(SRC, 'boards', id + '.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(SRC, 'boards/content.json'), 'utf8'));
// Black Friday sale switch. Copy is written as [[bf:during the sale||after the sale]] in boards, content files and this file.
// Every file the build writes goes through bfx(), so one date flips the whole site. DEAL_ON=1 or DEAL_ON=0 forces a side for testing.
const DEAL_END = '2026-12-01T06:59:59Z'; // midnight in Phoenix as November 30 ends
const DEAL_ON = process.env.DEAL_ON ? process.env.DEAL_ON === '1' : Date.now() < Date.parse(DEAL_END);
const bfx = (t) => t.replace(/\[\[bf:([\s\S]*?)\|\|([\s\S]*?)\]\]/g, (m, on, off) => (DEAL_ON ? on : off));
const _write = fs.writeFileSync.bind(fs);
fs.writeFileSync = (p, data, ...rest) => _write(p, typeof data === 'string' ? bfx(data) : data, ...rest);
const readIf = (p, fallback) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : fallback);
const policyMeta = JSON.parse(readIf(path.join(ROOT, 'content/policies/meta.json'), '{}'));
const hoods = JSON.parse(readIf(path.join(ROOT, 'research/neighborhoods.json'), '{}'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const ldjson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// ---------- static files (images, icons) ----------
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyDir(a, b); } else fs.copyFileSync(a, b);
  }
}
copyDir(path.join(ROOT, 'static'), DIST);

// ---------- script files with content hashes ----------
const assets = {};
function emit(name, code) {
  const file = name.replace(/(\.js)$/, '.' + hash(code) + '$1');
  const out = path.join(DIST, 'assets', file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code);
  assets[name] = '/assets/' + file;
  return assets[name];
}
emit('dc.js', fs.readFileSync(path.join(SRC, 'runtime/dc.js'), 'utf8'));
const cfgForClient = { firstVisitFrom: cfg.firstVisitFrom, scheduleDays: cfg.scheduleDays };
emit('apw.js', 'window.APW=window.APW||{};window.APW.cfg=' + JSON.stringify(cfgForClient) + ';\n' + fs.readFileSync(path.join(SRC, 'runtime/apw.js'), 'utf8'));

// ---------- server side rendering ----------
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const doc = dom.window.document;
function componentClass(script) {
  const sandbox = { DCLogic: DC.DCLogic, console, Intl, URLSearchParams, setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 0, clearInterval: () => { } };
  return vm.runInNewContext(script + '\n;Component', sandbox);
}
const boardCache = {};
function useBoard(id, markupFix) {
  const b = board(id);
  const markup = markupFix ? markupFix(b.markup) : b.markup;
  const key = id + ':' + hash(markup);
  if (!boardCache[key]) {
    const code = '(window.APW=window.APW||{}).boards=window.APW.boards||{};window.APW.boards[' + JSON.stringify(id) + ']={tpl:' + JSON.stringify(markup) +
      ',C:function(DCLogic){' + b.script + '\nreturn Component;}};\n';
    boardCache[key] = { b, markup, js: emit('b/' + id + '.js', code), Component: componentClass(b.script) };
  }
  return boardCache[key];
}
function ssr(entry, props) {
  return DC.renderToString(doc, entry.markup, entry.Component, Object.assign({ theme: 'dark' }, props));
}

// ---------- slots the boards leave for the site ----------
function badgesHtml() {
  if (!cfg.badges.length) return '';
  return '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 22px;">' + cfg.badges.map((x) =>
    '<a href="' + esc(x.url) + '" rel="noopener" target="_blank" style="display: inline-flex; align-items: center; min-height: 44px;">' +
    (x.img ? '<img src="' + esc(x.img) + '" alt="' + esc(x.name) + '" style="height: 44px; width: auto; display: block;">' : '<span class="flink">' + esc(x.name) + '</span>') + '</a>').join('') + '</div>';
}
function socialHtml() {
  if (!cfg.social.length) return '';
  return '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px;">' + cfg.social.map((x) =>
    '<a href="' + esc(x.url) + '" rel="noopener" target="_blank" class="btn btn-line-n" style="min-height: 44px; padding: 0 16px; font-size: 15px;">' + esc(x.name) + '</a>').join('') + '</div>';
}
// Every ZIP code in each town we serve, with the neighborhoods in it. The town copy (design/generator/longform.py) is the one list.
function townZips(area) {
  return ((content.cities[area] || {}).zips || []).filter((g) => g.names && g.names.length);
}
function zipsHtml(area, name) {
  const groups = townZips(area);
  if (!groups.length) return '';
  return '<div class="zipgs">' + groups.map((g) =>
    '<div class="zipg"><h3><span class="mono">ZIP ' + g.zip + '</span> ' + esc(g.label) + '</h3>' +
    '<ul class="hoods">' + g.names.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>').join('') +
    '<p style="margin: 14px 0 0; font-size: 15px; line-height: 1.55; color: var(--ink2);">Not sure about your street? Call or text 623.309.6104 and we will tell you right away.</p></div>';
}
function hoodNames(area) {
  return townZips(area).flatMap((g) => g.names);
}
const slots = (m, extra) => {
  let out = m.replace('<!--BADGES-->', badgesHtml()).replace('<!--SOCIAL-->', socialHtml());
  if (extra) out = extra(out);
  return out;
};

// ---------- page CSS ----------
const darkVars = (content.base_css.match(/\.apw\.dark\{([^}]*)\}/) || [])[1] || '';
const SITE_CSS = `html{background:#070B1B;-webkit-text-size-adjust:100%}
body{margin:0;background:#070B1B}
html.dark .apw{${darkVars}}
[id]{scroll-margin-top:92px}
#book-dock{display:none}
html.book-open{overflow:hidden}
html.book-open #book-dock{display:block;position:fixed;inset:0;z-index:60;background:#070B1B}
#book-dock>.apw{height:100%}
@media (min-width:1024px){
[id]{scroll-margin-top:104px}
html.book-open #book-dock{display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(7,11,27,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
#book-dock>.apw{width:440px!important;max-width:100%;height:min(860px,calc(100vh - 48px))!important;border-radius:26px;box-shadow:0 30px 80px rgba(0,0,0,.5);animation:dockIn .22s ease-out}
}
@keyframes dockIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.bookpage #app{height:100vh;height:100dvh}
@media (min-width:600px){.bookpage #app{width:430px;height:min(900px,calc(100dvh - 48px));margin:24px auto;border-radius:26px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}}
.apw .zipgs{margin-top:26px}
.apw .zipg{margin-top:18px}
.apw .zipg h3{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.2;color:var(--ink)}
.apw .zipg h3 .mono{font-size:14px;font-weight:600;letter-spacing:.04em;color:var(--accent-text)}
.apw .doc.docw{max-width:1160px}
.apw .towns{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:26px}
.apw .town{display:flex;flex-direction:column;padding:22px 22px 20px;border-radius:22px;background:var(--card);border:1px solid var(--line)}
.apw .doc .town h2{margin:0;font-size:28px}
.apw .town .tzips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;padding:0;list-style:none}
.apw .town .tzips li{padding:5px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent-text);font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px;font-weight:600}
.apw .doc .town p{font-size:16px}
.apw .doc .town .tgo{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-top:auto;padding-top:12px;font-size:16px;text-decoration:none}
.apw .doc table.ziplist{width:100%;margin-top:16px;border-collapse:collapse;font-size:16px}
.apw .doc table.ziplist th,.apw .doc table.ziplist td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left;color:var(--ink)}
.apw .doc table.ziplist th{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px;letter-spacing:.06em;color:var(--mute)}
.apw .doc table.ziplist td:first-child{font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:600;color:var(--accent-text)}
.apw .doc .hubcta{display:inline-flex;margin-top:22px;min-width:260px}
.apw .hoods{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}
.apw .hoods li{padding:8px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:15px;font-weight:600;color:var(--ink)}
.apw .doc{max-width:800px;margin:0 auto;padding:30px 20px 60px;background:var(--bg);color:var(--ink)}
@media (min-width:1024px){.apw .doc{padding:64px 32px 104px}.apw .doc .dh1{font-size:56px}}
.apw .doc .dh1{margin:10px 0 0;font-size:40px}
.apw .doc h2{margin:34px 0 0;font-size:24px;font-weight:800;letter-spacing:-.03em;line-height:1.15;color:var(--ink)}
.apw .doc h3{margin:22px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.apw .doc p,.apw .doc li{font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .doc p{margin:12px 0 0}
.apw .doc ul,.apw .doc ol{margin:12px 0 0;padding-left:22px}
.apw .doc li{margin-top:6px}
.apw .doc a{color:var(--accent-text);font-weight:700}
.apw .doc strong{color:var(--ink)}
.apw .doc .eb{color:var(--accent-text)}
.apw .doc .updated{margin-top:14px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px;color:var(--mute)}
.apw .doc .lead{font-size:19px;line-height:1.55;color:var(--ink)}
.apw .doc .tocd{margin:18px 0 0;padding:4px 16px 14px;border-radius:16px;background:var(--bg2);border:1px solid var(--line)}
.apw .doc .tocd summary{display:flex;align-items:center;min-height:44px;font-weight:800;color:var(--ink);cursor:pointer}
.apw .doc .toc{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 0;padding:0;list-style:none}
.apw .doc .toc a{display:inline-flex;align-items:center;min-height:40px;padding:0 12px;border-radius:999px;background:var(--bg2);border:1px solid var(--line);font-size:14px;color:var(--ink);text-decoration:none}
.apw .doc a.btn{text-decoration:none}.apw .doc a.btn-dot{color:var(--accent-ink)}
.skip{position:absolute;left:12px;top:-60px;z-index:100;padding:12px 16px;border-radius:12px;background:#FF4A1C;color:#0E1430;font:700 16px system-ui,sans-serif;text-decoration:none}
.skip:focus{top:12px}
@media (prefers-reduced-motion:reduce){#book-dock>.apw{animation:none}}`;

// ---------- structured data ----------
const BIZ_ID = ORIGIN + '/#business';
const PLACES = {
  buckeye: { name: 'Buckeye', locality: 'Buckeye', zips: ['85326', '85396'], url: '/pooper-scooper/buckeye-az/' },
  goodyear: { name: 'Goodyear', locality: 'Goodyear', zips: ['85338', '85395'], url: '/pooper-scooper/goodyear-az/' },
  litchfield: { name: 'Litchfield Park', locality: 'Litchfield Park', zips: ['85340'], url: '/pooper-scooper/litchfield-park-az/' },
  citrus: { name: 'Citrus Park', locality: 'Waddell', zips: ['85355'], url: '/pooper-scooper/citrus-park-az/' },
  verrado: { name: 'Verrado', locality: 'Buckeye', zips: ['85396'], url: '/pooper-scooper/buckeye-az/verrado/' }
};
const ALL_ZIPS = [['85326', 'Buckeye', 'buckeye'], ['85396', 'Buckeye', 'buckeye'], ['85338', 'Goodyear', 'goodyear'], ['85395', 'Goodyear', 'goodyear'], ['85340', 'Litchfield Park', 'litchfield'], ['85355', 'Waddell', 'citrus']];
const zipPlace = (zip, locality) => ({ '@type': 'Place', name: locality + ', AZ ' + zip, address: { '@type': 'PostalAddress', addressLocality: locality, addressRegion: 'AZ', postalCode: zip, addressCountry: 'US' } });
const cityPlace = (p) => ({ '@type': 'City', name: p.name + ', AZ', containedInPlace: { '@type': 'State', name: 'Arizona' } });
const place = (p) => [cityPlace(p)].concat(p.zips.map((z) => zipPlace(z, p.locality)));
const SERVED = [cityPlace(PLACES.buckeye), cityPlace(PLACES.goodyear), cityPlace(PLACES.litchfield), { '@type': 'Place', name: 'Citrus Park, AZ' }].concat(ALL_ZIPS.map((z) => zipPlace(z[0], z[1])));
const monthly = (name, price, desc) => ({
  '@type': 'Offer', name, description: desc, price: price.toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock',
  priceSpecification: { '@type': 'UnitPriceSpecification', price: price.toFixed(2), priceCurrency: 'USD', unitText: 'MONTH', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
  itemOffered: { '@type': 'Service', name: name, provider: { '@id': BIZ_ID } }
});
const OFFERS = [
  monthly('Dog poop pickup every week', 108, 'For 1 or 2 dogs. About $25 a visit. Each dog after two adds $13 a month. [[bf:First month free through November 30||First cleanup free]].'),
  monthly('Dog poop pickup twice a week', 189, 'For 1 or 2 dogs. Each dog after two adds $13 a month. [[bf:First month free through November 30||First cleanup free]].'),
  monthly('Dog poop pickup every other week', 75, 'For 1 or 2 dogs. Each dog after two adds $9 a month. [[bf:First month free through November 30||First cleanup free]].'),
  { '@type': 'Offer', name: 'Turf odor treatment', price: '35.00', priceCurrency: 'USD', itemOffered: { '@type': 'Service', name: 'Turf odor treatment' } },
  { '@type': 'Offer', name: 'One time yard cleanup', price: '95.00', priceCurrency: 'USD', itemOffered: { '@type': 'Service', name: 'One time dog poop cleanup' } }
];
const business = {
  '@type': 'LocalBusiness', '@id': BIZ_ID, name: cfg.name, url: ORIGIN + '/',
  founder: { '@type': 'Person', name: 'Juan Gonzalez', jobTitle: 'Owner', homeLocation: { '@type': 'Place', name: 'Verrado, Buckeye, Arizona' } },
  description: 'Dog poop pickup and pet waste removal for every home in Buckeye (85326, 85396), Goodyear (85338, 85395), Litchfield Park (85340) and Waddell and Citrus Park (85355), Arizona. Weekly, twice a week, or every other week. [[bf:First month free||First cleanup free]], free deodorizer spray at every visit, and a photo of your latched gate after each visit. Licensed, bonded and insured.',
  telephone: '+1-623-309-6104', email: cfg.email,
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '08:00', closes: '17:00' }],
  logo: ORIGIN + '/assets/img/icon-512.png', image: ORIGIN + '/assets/img/og.png',
  priceRange: '$75 to $189 a month', currenciesAccepted: 'USD', paymentAccepted: 'Credit card, debit card, Apple Pay, Google Pay',
  areaServed: SERVED,
  knowsAbout: ['Dog poop pickup', 'Pet waste removal', 'Pooper scooper service', 'Artificial turf odor treatment', 'Yard deodorizing'],
  slogan: 'You always know. Or you don’t pay.',
  hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Dog poop pickup plans', itemListElement: OFFERS }
};
if (cfg.sameAs.length) business.sameAs = cfg.sameAs;
const website = { '@type': 'WebSite', '@id': ORIGIN + '/#website', url: ORIGIN + '/', name: cfg.name, publisher: { '@id': BIZ_ID }, inLanguage: 'en-US' };
const faqLd = (url, items) => ({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: items.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) });
const crumbs = (url, trail) => ({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[0], item: ORIGIN + t[1] })) });

// ---------- pages ----------
const FONTS_PRE = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
const BF_BAR = `<a class="bf" href="/book/" data-deal-end="${DEAL_END}" aria-label="Black Friday sale. Your first month is free. Ends Monday, November 30."><span class="bf-tag">Black Friday</span><span class="bf-t">First month free</span><span class="bf-d">Ends Mon, Nov 30</span><span class="bf-c" aria-hidden="true"><b data-u="d">00</b>d <b data-u="h">00</b>h <b data-u="m">00</b>m <b data-u="s">00</b>s</span><span class="bf-go">Get it ›</span></a>`;
const BF_SKIP = new Set(['/book/', '/account/']);
const BF_CSS = `.bf{font-family:"Schibsted Grotesk",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 12px;padding:9px 14px;background:#0B0B0F;color:#fff;text-decoration:none;font-size:14px;line-height:1.3;text-align:center}.bf:hover .bf-go,.bf:focus-visible .bf-go{text-decoration:underline}.bf-tag{padding:3px 8px;border-radius:6px;background:#FF4A1C;color:#0E1430;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.bf-t{font-weight:800}.bf-d{color:#C9CDE0}.bf-c{display:none;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-weight:700;color:#FFB199;font-variant-numeric:tabular-nums}.bf-c b{font-weight:800}html.bf-live .bf-c{display:inline}.bf-go{font-weight:800;color:#FF8A66}@media (max-width:560px){.bf{gap:4px 10px;padding:8px 10px;font-size:13px}.bf-d,.bf-go{display:none}}.bfd{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px 24px;margin:0 0 22px;padding:20px 22px;border-radius:22px;background:#0B0B0F;color:#fff;border:2px solid #FF4A1C;box-shadow:0 0 0 4px rgba(255,74,28,.18)}.bfd p{margin:0}.bfd-tag{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#FF8A66}.bfd-dot{width:8px;height:8px;border-radius:50%;background:#FF4A1C;animation:bfp 1.4s infinite}@keyframes bfp{50%{opacity:.25}}.bfd .bfd-h{margin-top:8px;font-size:clamp(26px,4vw,38px);font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#fff}.bfd-h span{color:#FF4A1C}.bfd .bfd-p{margin-top:8px;font-size:16px;line-height:1.45;color:#D5DAF0}.bfd .bfd-ends{margin-bottom:8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#C9CDE0;text-align:center}.bfd-clock{display:flex;justify-content:center;gap:8px}.bfd-clock span{display:grid;justify-items:center;min-width:58px;padding:8px 6px;border-radius:12px;background:#1A1B24;border:1px solid #2C2E3A}.bfd-clock b{font-size:26px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;color:#fff}.bfd-clock i{margin-top:4px;font-style:normal;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9CA2BD}.bfd .bfd-fine{grid-column:1/-1;font-size:13px;line-height:1.45;color:#9CA2BD}@media (max-width:720px){.bfd{grid-template-columns:minmax(0,1fr);padding:18px}.bfd .bfd-ends{text-align:left}.bfd-clock{justify-content:flex-start}}.sticker.bf-st{background:#0B0B0F;color:#fff}.sticker.bf-st::after{border-color:rgba(255,74,28,.95)}.bf-chip{display:inline-flex;align-items:center;gap:8px;margin:10px 0 0;padding:6px 12px 6px 6px;border-radius:999px;background:#0B0B0F;color:#fff;font-size:14px;font-weight:700}.bf-chip span{padding:3px 8px;border-radius:999px;background:#FF4A1C;color:#0E1430;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}@media (prefers-reduced-motion:reduce){.bfd-dot{animation:none}}html.bf-over .bf,html.bf-over [data-deal-end]{display:none!important}`;
function page(p) {
  const url = ORIGIN + p.route;
  const robots = p.index ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow';
  const graph = p.index ? [website, business, { '@type': 'WebPage', '@id': url + '#webpage', url, name: p.title, description: p.description, isPartOf: { '@id': ORIGIN + '/#website' }, about: { '@id': BIZ_ID }, inLanguage: 'en-US', dateModified: TODAY }, ...(p.ld || [])] : null;
  const css = p.css.join('\n') + '\n' + SITE_CSS + '\n' + BF_CSS + '\n.stf{display:block;width:max-content;margin:0 auto;padding:6px 10px 10px;font:10px/1 ui-monospace,Consolas,monospace;letter-spacing:.12em;color:#2A3150;text-decoration:none}.stf:hover,.stf:focus-visible{color:#6B7398}@media (max-width:1023px){.stf{padding-bottom:104px}}';
  const scripts = [assets['dc.js'], ...p.boards.map((b) => b.js), assets['apw.js']];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<meta name="robots" content="${robots}">
${p.index ? `<link rel="canonical" href="${url}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:title" content="${esc(p.ogTitle || p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/assets/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Arizona Pet Waste. Dog poop pickup you can watch. [[bf:First month free||First cleanup free]].">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0A0F24">
<meta name="format-detection" content="telephone=no">
<link rel="icon" href="/assets/img/icon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
${FONTS_PRE}
${p.fonts}
<script>document.documentElement.classList.add('dark')</script>
<style>${css}</style>
${graph ? `<script type="application/ld+json">${ldjson({ '@context': 'https://schema.org', '@graph': graph })}</script>` : ''}
</head>
<body${p.bodyClass ? ` class="${p.bodyClass}"` : ''}>
<a class="skip" href="#app">Skip to content</a>
${BF_SKIP.has(p.route) ? '' : '[[bf:' + BF_BAR + '||]]'}
<div id="app" data-board="${p.board}">${p.body}</div>
<a class="stf" href="/crew/" rel="nofollow">staff</a>
${p.dock ? `<div id="book-dock" role="dialog" aria-modal="true" aria-label="[[bf:Start your free month||Book now]]">${p.dock}</div>` : ''}
<noscript><style>#book-dock{display:none!important}</style></noscript>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
  const out = p.route.endsWith('.html') ? path.join(DIST, p.route) : path.join(DIST, p.route, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { route: p.route, bytes: Buffer.byteLength(html), index: p.index };
}

const built = [];
const bookDock = useBoard('book', (m) => m.replace(/<(\/?)h1(?=[\s>])/g, '<$1h2'));
const dockHtml = ssr(bookDock, { mode: 'dock' });

// home
{
  const e = useBoard('main', (m) => slots(m));
  const url = ORIGIN + '/';
  built.push(page({
    route: '/', board: 'main', index: true,
    title: 'Pooper Scooper in the West Valley, AZ | Arizona Pet Waste',
    ogTitle: 'Dog poop pickup you can watch | Arizona Pet Waste',
    description: 'Pooper scooper service in Buckeye, Goodyear, Litchfield Park and Citrus Park, AZ. Weekly dog poop removal, free deodorizer spray, [[bf:first month free||first cleanup free]].',
    fonts: e.b.fonts, css: [e.b.css, bookDock.b.css.replace(content.base_css, '')], boards: [e, bookDock],
    body: ssr(e), dock: dockHtml,
    ld: [faqLd(url, content.faq.main), {
      '@type': 'Service', '@id': url + '#service', name: 'Dog poop pickup', serviceType: 'Pet waste removal', provider: { '@id': BIZ_ID },
      areaServed: SERVED, offers: { '@type': 'AggregateOffer', lowPrice: '75.00', highPrice: '189.00', priceCurrency: 'USD', offerCount: 3 }
    }]
  }));
}

// towns
const TOWNS = [
  { area: 'buckeye', board: 'city-buckeye', route: '/pooper-scooper/buckeye-az/', title: 'Pooper Scooper in Buckeye, AZ | Arizona Pet Waste',
    description: 'Pooper scooper and dog poop removal for every home in Buckeye, AZ 85326 and 85396, Verrado to Sundance. [[bf:First month free||First cleanup free]], free deodorizer spray and a gate photo.' },
  { area: 'goodyear', board: 'city-goodyear', route: '/pooper-scooper/goodyear-az/', title: 'Pooper Scooper in Goodyear, AZ | Arizona Pet Waste',
    description: 'Pooper scooper and dog poop removal for every home in Goodyear, AZ 85338 and 85395, Estrella to PebbleCreek. [[bf:First month free||First cleanup free]] and free deodorizer spray.' },
  { area: 'litchfield', board: 'city-litchfield', route: '/pooper-scooper/litchfield-park-az/', title: 'Pooper Scooper in Litchfield Park, AZ | Arizona Pet Waste',
    description: 'Pooper scooper and dog poop removal for every home in Litchfield Park, AZ 85340. [[bf:First month free||First cleanup free]], free deodorizer spray and a photo of your latched gate.' },
  { area: 'citrus', board: 'city-citrus', route: '/pooper-scooper/citrus-park-az/', title: 'Pooper Scooper in Citrus Park, AZ | Arizona Pet Waste',
    description: 'Pooper scooper and dog poop removal for every home in Citrus Park and Waddell, AZ 85355. [[bf:First month free||First cleanup free]], free deodorizer spray and a photo of your latched gate.' },
  { area: 'verrado', board: 'city-verrado', route: '/pooper-scooper/buckeye-az/verrado/', title: 'Pooper Scooper in Verrado, Buckeye AZ | Arizona Pet Waste',
    description: 'Pooper scooper and dog poop removal for Verrado homes in Buckeye, AZ 85396. [[bf:First month free||First cleanup free]], free deodorizer spray and a photo of your latched gate.' }
];
for (const t of TOWNS) {
  const c = content.cities[t.area];
  const e = useBoard(t.board, (m) => slots(m, (x) => x.replace('<!--HOODS-->', zipsHtml(t.area, c.name))));
  const url = ORIGIN + t.route;
  built.push(page({
    route: t.route, board: t.board, index: true, title: t.title, description: t.description,
    fonts: e.b.fonts, css: [e.b.css, bookDock.b.css.replace(content.base_css, '')], boards: [e, bookDock],
    body: ssr(e), dock: dockHtml,
    ld: [faqLd(url, c.faq), crumbs(url, [['Home', '/'], ['Areas we serve', '/pooper-scooper/']].concat(t.area === 'verrado' ? [['Buckeye', '/pooper-scooper/buckeye-az/']] : []).concat([[c.name, t.route]])), {
      '@type': 'Service', '@id': url + '#service', name: 'Pooper scooper service in ' + c.name, serviceType: 'Pet waste removal', provider: { '@id': BIZ_ID },
      areaServed: place(PLACES[t.area]).concat(hoodNames(t.area).map((n) => ({ '@type': 'Place', name: n + ', AZ' }))), description: c.intro, offers: { '@type': 'AggregateOffer', lowPrice: '75.00', highPrice: '189.00', priceCurrency: 'USD', offerCount: 3 }
    }]
  }));
}

// areas we serve: one page that lists every town and every ZIP code (designed layout from build/biz.mjs)
{
  const route = '/pooper-scooper/';
  const url = ORIGIN + route;
  const order = ['buckeye', 'goodyear', 'litchfield', 'citrus', 'verrado'];
  const blurbs = {
    buckeye: 'North Buckeye by the White Tank Mountains, and the rest of Buckeye from Sundance to downtown.',
    goodyear: 'All of Goodyear, from PebbleCreek and Palm Valley down to Estrella Mountain Ranch.',
    litchfield: 'Every 85340 home, inside the city and out, from The Wigwam to Dreaming Summit.',
    citrus: 'All of Citrus Park and Waddell, from big irrigated lots to new neighborhoods like Zanjero Pass.',
    verrado: 'Every Verrado district, at the foot of the White Tank Mountains in Buckeye.'
  };
  const cards = '<div class="bxtowns bxtowns-g">' + order.map((a) => {
    const p = PLACES[a];
    const names = townZips(a).flatMap((g) => g.names).slice(0, 6);
    return '<a class="bxtown" href="' + p.url + '"><span class="bxtown-n">' + esc(p.name) + '</span>' +
      '<span class="bxzips">' + p.zips.map((z) => '<i>' + z + '</i>').join('') + '</span>' +
      '<span class="bxtown-p">' + esc(blurbs[a]) + '</span><span class="bxtown-h">' + esc(names.join(' · ')) + '</span>' +
      '<span class="bxgo">Pooper scooper in ' + esc(p.name) + ' ›</span></a>';
  }).join('') + '</div>';
  const rows = ALL_ZIPS.map((z) => '<tr><td>' + z[0] + '</td><td>' + esc(z[1]) + '</td><td><a href="' + PLACES[z[2]].url + '">' + esc(PLACES[z[2]].name) + ' page</a></td></tr>').join('');
  const sec = (id, k, h, lead, inner, alt) => '<section class="bxs' + (alt ? ' bxalt' : '') + '" id="' + id + '"><div class="bxw">' + BIZ.h2(id + '-h', h, k) + (lead ? '<p class="bxl">' + lead + '</p>' : '') + inner + '</div></section>';
  const book = '<div class="bxh-cta"><a class="btn btn-dot" href="/book/">[[bf:Start your free month||Book now]]</a><a class="btn btn-line-n" href="#zip-codes">See every ZIP code</a></div>';
  const pg = {
    eyebrow: 'Every home in 6 ZIP codes', h1: 'Pooper scooper service areas',
    hero: {
      lead: 'We pick up dog poop at every home in six West Valley ZIP codes: Buckeye, Goodyear, Litchfield Park, and Waddell with Citrus Park. Pick your town to see neighborhoods, prices and answers.',
      ctaHtml: book, side: BIZ.mapBox(content.svcmap.res), trust: 'Licensed, bonded and insured · No sign up fee · No contract',
      stats: [['6', 'ZIP codes', 'We scoop every home in all six'], ['4', 'towns', 'Plus every Verrado district'], ['$0', '[[bf:today||first visit]]', '[[bf:Black Friday sale. First month free||Your first cleanup is free]]']]
    }
  };
  const inner = BIZ.hero(pg, [['Home', '/'], ['Areas we serve', route]]) +
    sec('towns', 'Pick your town', 'Towns we serve', 'Each town page shows the neighborhoods we cover, local dog poop rules and answers to common questions.', cards) +
    sec('zip-codes', 'ZIP codes', 'Every ZIP code we serve', 'If your address is in one of these ZIP codes, we come to you.',
      '<div class="bxtable-wrap"><table class="bxtable bxzipt"><thead><tr><th scope="col">ZIP</th><th scope="col">Town</th><th scope="col">Page</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="bxnote">Not sure about your street? Call or text 623.309.6104 and we will tell you right away.</p>', true) +
    sec('not-listed', 'Coming soon', 'Not on the list? Join the waitlist', 'We don’t come to you yet? Tap the button, type your ZIP, and add your name, phone and address. We will tell you when we start in your area.',
      '<ul class="bxsoon">' + ['Surprise', 'Peoria', 'Glendale', 'Laveen', 'Central Valley', 'East Valley', 'Tucson', 'Flagstaff', 'Kingman', 'Lake Havasu City'].map((x) => '<li>' + x + '</li>').join('') + '</ul>' +
      '<p class="bxl"><strong>[[bf:Join by November 30 and your first month is free when we start in your area.||Your first cleanup is free when we start in your area.]]</strong></p>' +
      '<div class="bxh-cta"><a class="btn btn-dot" href="/book/">Join the waitlist</a></div>') +
    sec('commercial', 'HOAs and businesses', 'Need it for an HOA or a business', 'We also service pet waste stations and common areas for HOAs, apartments, dog parks and businesses in the same four towns.',
      BIZ.townsStrip() + '<p class="bxnote"><a href="' + BIZ.HUB + '">See commercial pet waste removal</a></p>', true) +
    '<section class="bxcta"><div class="bxw"><div class="bxcta-in"><div><h2 id="get-started">[[bf:Start your free month||Book now]]<span class="dot">.</span></h2>' +
    '<p>Sign up in about 2 minutes. You pay $0 today, and we text you your day and time.</p></div>' +
    '<div class="bxh-cta"><a class="btn btn-dot" href="/book/">Book now</a><a class="btn btn-line-n" href="tel:+16233096104">' + BIZ.ICONS.phone + 'Call ' + BIZ.PHONE + '</a></div></div></div></section>';
  const e = useBoard('doc', (mk) => slots(mk).replace('class="doc"', 'class="doc bxdoc"').replace('@@DOC@@', inner));
  built.push(page({
    route, board: 'doc', index: true, title: 'Pooper Scooper Areas in the West Valley AZ | Arizona Pet Waste',
    description: 'Pooper scooper service for every home in Buckeye, Goodyear, Litchfield Park and Waddell, AZ: ZIP 85326, 85338, 85340, 85355, 85395 and 85396.',
    fonts: e.b.fonts, css: [e.b.css, BIZ.BIZ_CSS, content.svcmap.css], boards: [e], body: ssr(e),
    ld: [crumbs(url, [['Home', '/'], ['Areas we serve', route]]),
      { '@type': 'ItemList', '@id': url + '#towns', name: 'Towns Arizona Pet Waste serves', itemListElement: order.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: PLACES[a].name, url: ORIGIN + PLACES[a].url })) },
      { '@type': 'Service', '@id': url + '#service', name: 'Dog poop pickup in the West Valley', serviceType: 'Pet waste removal', provider: { '@id': BIZ_ID }, areaServed: SERVED,
        offers: { '@type': 'AggregateOffer', lowPrice: '75.00', highPrice: '189.00', priceCurrency: 'USD', offerCount: 3 } }]
  }));
}

// real pages for the header links: how it works, pricing, FAQ
{
  const pages = [
    { slug: 'how-it-works', h1: 'How our pooper scooper service works', title: 'How Our Pooper Scooper Service Works | Arizona Pet Waste',
      description: 'See every step of our pooper scooper visits: a text the night before, a live truck map, free deodorizer spray and a photo of your latched gate.' },
    { slug: 'pricing', h1: 'Pooper scooper prices', title: 'Pooper Scooper Prices, West Valley AZ | Arizona Pet Waste',
      description: 'Pooper scooper prices: $108 a month for weekly visits with 1 or 2 dogs. No sign up fee, free deodorizer spray, billed on the 1st, [[bf:first month free||first cleanup free]].' }
  ];
  for (const pg of pages) {
    const route = '/' + pg.slug + '/';
    const url = ORIGIN + route;
    const inner = '<p class="eb">Arizona Pet Waste</p><h1 class="h1 dh1">' + esc(pg.h1) + '<span style="color: var(--accent);">.</span></h1>' +
      fs.readFileSync(path.join(ROOT, 'content/pages', pg.slug + '.html'), 'utf8');
    const e = useBoard('doc', (mk) => slots(mk).replace('class="doc"', 'class="doc docw"').replace('@@DOC@@', inner));
    const ld = [crumbs(url, [['Home', '/'], [pg.h1, route]])];
    if (pg.slug === 'pricing') ld.push({ '@type': 'Service', '@id': url + '#service', name: 'Pooper scooper service', serviceType: 'Pet waste removal', provider: { '@id': BIZ_ID }, areaServed: SERVED,
      offers: [['Every week, 1 or 2 dogs', '108.00'], ['Twice a week, 1 or 2 dogs', '189.00'], ['Every other week, 1 or 2 dogs', '75.00']].map(([n, pr]) => ({ '@type': 'Offer', name: n, price: pr, priceCurrency: 'USD',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: pr, priceCurrency: 'USD', unitText: 'MONTH' } })) });
    built.push(page({ route, board: 'doc', index: true, title: pg.title, description: pg.description, fonts: e.b.fonts, css: [e.b.css], boards: [e], body: ssr(e), ld }));
  }
  // FAQ: every question from the home page plus the questions every town page answers
  const route = '/faq/';
  const url = ORIGIN + route;
  const groups = [['General questions', content.faq.main], ['More questions', content.faq.common]];
  const seen = new Set();
  const all = [];
  let body = '';
  for (const [h, list] of groups) {
    const items = list.filter((x) => !seen.has(x.q) && seen.add(x.q));
    all.push(...items);
    body += '<h2>' + esc(h) + '<span style="color: var(--accent);">.</span></h2>' + items.map((x) => '<h3>' + esc(x.q) + '</h3><p>' + esc(x.a) + '</p>').join('');
  }
  const inner = '<p class="eb">Arizona Pet Waste</p><h1 class="h1 dh1">Pooper scooper FAQ<span style="color: var(--accent);">.</span></h1>' +
    '<p class="lead">Answers to the questions people ask us most. Still wondering? Call or text <a href="tel:+16233096104">623.309.6104</a>.</p>' + body +
    '<a class="btn btn-dot hubcta" href="/book/">[[bf:Start your free month||Book now]]</a>';
  const e = useBoard('doc', (mk) => slots(mk).replace('class="doc"', 'class="doc docw"').replace('@@DOC@@', inner));
  built.push(page({ route, board: 'doc', index: true, title: 'Pooper Scooper FAQ | Arizona Pet Waste',
    description: 'Pooper scooper questions answered: prices, billing on the 1st, set routes, same day pickup, gate codes, turf, rock yards, skips, pauses and canceling.',
    fonts: e.b.fonts, css: [e.b.css], boards: [e], body: ssr(e), ld: [crumbs(url, [['Home', '/'], ['FAQ', route]]), faqLd(url, all)] }));
}

// file pages: every HTML fragment under content/site/ becomes a page at the same path
// (content/site/commercial-pet-waste-removal/index.html -> /commercial-pet-waste-removal/, content/site/blog/x.html -> /blog/x/).
// Each file starts with a JSON header in a comment: <!--{"title","description","h1","type":"service|blog|page","date","crumbs":[[name,route]],"faq":[[q,a]],"area"}-->
const FILE_PAGES = [];
{
  const base = path.join(ROOT, 'content/site');
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith('.html') ? [path.join(d, x.name)] : [])) : []);
  for (const f of walk(base).sort()) {
    const rel = path.relative(base, f).split(path.sep).join('/');
    const route = '/' + rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '/');
    const raw = fs.readFileSync(f, 'utf8');
    const m = raw.match(/^<!--([\s\S]*?)-->/);
    if (!m) throw new Error('no JSON header in ' + rel);
    const meta = JSON.parse(m[1]);
    FILE_PAGES.push(Object.assign({ route, html: raw.slice(m[0].length).trim(), file: rel }, meta));
  }
  const posts = FILE_PAGES.filter((x) => x.type === 'blog').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (posts.length && !FILE_PAGES.some((x) => x.route === '/blog/')) {
    FILE_PAGES.push({ route: '/blog/', type: 'blogindex', h1: 'Dog care blog', title: 'Dog Care Blog for West Valley Dog Owners | Arizona Pet Waste',
      description: 'Tips for West Valley dog owners: yard care, dog health and safety in the Arizona heat, turf odor, local poop laws and more from Arizona Pet Waste.',
      html: '<p class="lead">Tips for dog owners in Buckeye, Goodyear, Litchfield Park and Citrus Park. Clean yards, healthy dogs, and life in the Arizona heat.</p>' +
        '<div class="towns">' + posts.map((x) => '<article class="town"><h2><a href="' + x.route + '">' + esc(x.h1) + '</a></h2><p>' + esc(x.description) + '</p>' +
          '<p style="color: var(--mute); font-size: 15px;">' + esc(fmtDate(x.date)) + '</p><a class="tgo" href="' + x.route + '">Read it ›</a></article>').join('') + '</div>',
      posts });
  }
  for (const pg of FILE_PAGES) {
    const url = ORIGIN + pg.route;
    const trail = [['Home', '/']].concat(pg.crumbs || []).concat(pg.type === 'blog' ? [['Blog', '/blog/']] : []).concat([[pg.crumb || pg.h1, pg.route]]);
    if (pg.layout === 'biz') {
      const inner = BIZ.bizInner(pg, trail, { comMap: content.svcmap.com });
      const e = useBoard('doc', (mk) => slots(mk).replace('class="doc"', 'class="doc bxdoc"').replace('@@DOC@@', inner));
      const ld = [crumbs(url, trail)];
      if (pg.faq && pg.faq.length) ld.push(faqLd(url, pg.faq.map(([q, a]) => ({ q, a }))));
      const svc = { '@type': 'Service', '@id': url + '#service', name: pg.service || pg.h1, serviceType: pg.serviceType || 'Commercial pet waste removal', provider: { '@id': BIZ_ID },
        areaServed: pg.area && PLACES[pg.area] ? place(PLACES[pg.area]) : SERVED, description: pg.description, url,
        audience: { '@type': 'BusinessAudience', name: pg.audience || 'HOAs, property managers and businesses' } };
      if (pg.catalog) svc.hasOfferCatalog = { '@type': 'OfferCatalog', name: 'Commercial pet waste services', itemListElement: BIZ.SERVICES.filter((s) => !s.href.includes('#')).map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.go, url: ORIGIN + s.href, provider: { '@id': BIZ_ID } } })) };
      ld.push(svc);
      built.push(page({ route: pg.route, board: 'doc', index: true, title: pg.title, description: pg.description, fonts: e.b.fonts, css: [e.b.css, BIZ.BIZ_CSS, content.svcmap.css], boards: [e], body: ssr(e), ld }));
      continue;
    }
    let inner = '<p class="eb">' + esc(pg.eyebrow || 'Arizona Pet Waste') + '</p><h1 class="h1 dh1">' + esc(pg.h1) + '<span style="color: var(--accent);">.</span></h1>';
    if (pg.type === 'blog') inner += '<p class="mono" style="margin: 12px 0 0; font-size: 13px; color: var(--mute);">' + esc(fmtDate(pg.date).toUpperCase()) + ' · ' + Math.max(2, Math.round(pg.html.replace(/<[^>]+>/g, ' ').split(/\s+/).length / 200)) + ' MINUTE READ</p>';
    inner += pg.html;
    if (pg.faq && pg.faq.length) inner += '<h2 id="questions">Questions<span style="color: var(--accent);">.</span></h2>' + pg.faq.map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('');
    if (!/href="\/book\/"|href="tel:/.test(pg.html) && pg.type !== 'blogindex') inner += '<a class="btn btn-dot hubcta" href="/book/">[[bf:Start your free month||Book now]]</a>';
    const e = useBoard('doc', (mk) => slots(mk).replace('class="doc"', 'class="doc docw"').replace('@@DOC@@', inner));
    const ld = [crumbs(url, trail)];
    if (pg.faq && pg.faq.length) ld.push(faqLd(url, pg.faq.map(([q, a]) => ({ q, a }))));
    if (pg.type === 'service') ld.push({ '@type': 'Service', '@id': url + '#service', name: pg.service || pg.h1, serviceType: pg.serviceType || 'Pet waste removal', provider: { '@id': BIZ_ID },
      areaServed: pg.area && PLACES[pg.area] ? place(PLACES[pg.area]) : SERVED, description: pg.description });
    if (pg.type === 'blog') ld.push({ '@type': 'BlogPosting', '@id': url + '#post', headline: pg.h1, description: pg.description, datePublished: pg.date, dateModified: pg.updated || pg.date,
      author: { '@type': 'Organization', name: 'Arizona Pet Waste', url: ORIGIN + '/' }, publisher: { '@id': BIZ_ID }, mainEntityOfPage: url, image: ORIGIN + '/assets/img/og.png', inLanguage: 'en-US' });
    if (pg.type === 'blogindex') ld.push({ '@type': 'Blog', '@id': url + '#blog', name: 'Arizona Pet Waste dog care blog', publisher: { '@id': BIZ_ID },
      blogPost: pg.posts.map((x) => ({ '@type': 'BlogPosting', headline: x.h1, url: ORIGIN + x.route, datePublished: x.date })) });
    built.push(page({ route: pg.route, board: 'doc', index: true, title: pg.title, description: pg.description, fonts: e.b.fonts, css: [e.b.css], boards: [e], body: ssr(e), ld }));
  }
}
function fmtDate(iso) { return iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''; }

// policies
const POLICIES = [['privacy', 'Privacy Policy'], ['terms', 'Terms of Service'], ['texts', 'Text Message Terms'], ['accessibility', 'Accessibility']];
for (const [slug, fallbackH1] of POLICIES) {
  const m = policyMeta[slug] || {};
  const frag = readIf(path.join(ROOT, 'content/policies', slug + '.html'), '<p class="lead">This page is being written.</p>');
  const toc = [...frag.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((x) => '<li><a href="#' + x[1] + '">' + x[2].replace(/<[^>]+>/g, '') + '</a></li>').join('');
  const h1 = m.h1 || fallbackH1;
  const inner = '<p class="eb">Arizona Pet Waste</p><h1 class="h1 dh1">' + esc(h1) + '<span style="color: var(--accent);">.</span></h1>' +
    (toc ? '<details class="tocd"><summary>On this page</summary><ul class="toc">' + toc + '</ul></details>' : '') + frag;
  const e = useBoard('doc', (mk) => slots(mk).replace('@@DOC@@', inner));
  const route = '/' + slug + '/';
  built.push(page({
    route, board: 'doc', index: true, title: /Arizona Pet Waste/.test(m.title || '') ? m.title.replace(/\s*[·|]\s*Arizona Pet Waste.*$/, '') + ' | Arizona Pet Waste' : (m.title || h1) + ' | Arizona Pet Waste', description: m.description || h1 + ' for Arizona Pet Waste.',
    fonts: e.b.fonts, css: [e.b.css], boards: [e], body: ssr(e),
    ld: [crumbs(ORIGIN + route, [['Home', '/'], [h1, route]])]
  }));
}

// sign up and My Yard (not for search results)
{
  const e = useBoard('book');
  built.push(page({
    route: '/book/', board: 'book', index: false, bodyClass: 'bookpage', title: '[[bf:Start Your Free Month||Book Now]] | Arizona Pet Waste',
    description: 'Sign up for dog poop pickup in Buckeye, Goodyear, Litchfield Park and Citrus Park, AZ. [[bf:Black Friday sale: sign up by November 30 and your first month is free.||Your first cleanup is free.]]',
    fonts: e.b.fonts, css: [e.b.css], boards: [e], body: ssr(e, { mode: 'page' })
  }));
  const a = useBoard('account');
  built.push(page({
    route: '/account/', board: 'account', index: false, title: 'My Yard | Arizona Pet Waste',
    description: 'Sign in to My Yard to see your visits, skip, pause, see your bills and manage your card.',
    fonts: a.b.fonts, css: [a.b.css], boards: [a], body: ssr(a)
  }));
  const nf = useBoard('doc', (mk) => slots(mk).replace('@@DOC@@', '<p class="eb">Arizona Pet Waste</p><h1 class="h1 dh1">We could not find that page<span style="color: var(--accent);">.</span></h1>' +
    '<p class="lead">The link may be old. These pages can help.</p><ul><li><a href="/">Home</a></li><li><a href="/book/">[[bf:Start your free month||Book now]]</a></li><li><a href="/pooper-scooper/">Areas we serve</a></li><li><a href="/pooper-scooper/buckeye-az/">Buckeye</a></li><li><a href="/pooper-scooper/goodyear-az/">Goodyear</a></li><li><a href="/pooper-scooper/litchfield-park-az/">Litchfield Park</a></li><li><a href="/pooper-scooper/citrus-park-az/">Citrus Park</a></li><li><a href="/pooper-scooper/buckeye-az/verrado/">Verrado</a></li></ul>'));
  built.push(page({
    route: '/404.html', board: 'doc', index: false, title: 'Page Not Found | Arizona Pet Waste', description: 'We could not find that page.',
    fonts: nf.b.fonts, css: [nf.b.css], boards: [nf], body: ssr(nf)
  }));
}

// ---------- search and AI files ----------
const indexed = built.filter((b) => b.index);
const priority = (r) => (r === '/' ? '1.0' : ['/privacy/', '/terms/', '/texts/', '/accessibility/'].includes(r) ? '0.3' : '0.9');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  indexed.map((b) => `  <url><loc>${ORIGIN}${b.route}</loc><lastmod>${TODAY}</lastmod><priority>${priority(b.route)}</priority></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(DIST, 'robots.txt'), `# Search engines and AI assistants are welcome to read this site.
User-agent: *
User-agent: Googlebot
User-agent: Bingbot
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot
User-agent: Applebot-Extended
User-agent: DuckAssistBot
Allow: /
Disallow: /api/

Sitemap: ${ORIGIN}/sitemap.xml
`);
const faqText = content.faq.main.map((x) => `- ${x.q} ${x.a}`).join('\n');
fs.writeFileSync(path.join(DIST, 'llms.txt'), `# Arizona Pet Waste

> Dog poop pickup (pet waste removal) for every home in six West Valley, Arizona ZIP codes, from a licensed, bonded and insured local company: Buckeye (85326, 85396), Goodyear (85338, 85395), Litchfield Park (85340) and Waddell with Citrus Park (85355). Weekly, twice a week or every other week. [[bf:First month free through November 30||First cleanup free]]. Free deodorizer spray at every visit. A photo of your latched gate after every visit, and a live map of our truck on visit day. No contract.

## Prices (per month)
- Every week: $108 for 1 or 2 dogs (about $25 a visit). Each dog after two adds $13.
- Twice a week: $189 for 1 or 2 dogs. Each dog after two adds $13.
- Every other week: $75 for 1 or 2 dogs. Each dog after two adds $9.
- Turf odor treatment: $35. One time cleanup: $95. Same day pickup for a party or guests: $49, added to the next bill.
- Billing: everyone is billed on the 1st of each month.[[bf: During the Black Friday sale (sign up by November 30, 2026) the first month is free, and the first charge only covers the days after the free month. Then the full price on the 1st. A card is saved at sign up and nothing is charged that day.||]]
[[bf:- Black Friday sale: sign up by Monday, November 30, 2026 and the first month is free. The sale ends at midnight on November 30. The free month stays free when the customer keeps the plan for 60 days. Canceling in the first 60 days is charged one month at the plan price, minus anything already paid. Canceling is done online in My Yard, with no phone call.||- Offer: the first cleanup is free. The Black Friday free month sale ended on November 30, 2026. Customers who signed up in the sale keep the free month when they keep the plan for 60 days.]]

## Service area (every home in these ZIP codes)
- [Buckeye, AZ 85326 and 85396](${ORIGIN}/pooper-scooper/buckeye-az/). Neighborhoods: ${hoodNames('buckeye').join(', ')}.
- [Goodyear, AZ 85338 and 85395](${ORIGIN}/pooper-scooper/goodyear-az/). Neighborhoods: ${hoodNames('goodyear').join(', ')}.
- [Litchfield Park, AZ 85340](${ORIGIN}/pooper-scooper/litchfield-park-az/). Neighborhoods: ${hoodNames('litchfield').join(', ')}.
- [Citrus Park and Waddell, AZ 85355](${ORIGIN}/pooper-scooper/citrus-park-az/), plus Citrus Park homes with Litchfield Park 85340 addresses. Neighborhoods: ${hoodNames('citrus').join(', ')}.
- [Verrado, Buckeye AZ 85396](${ORIGIN}/pooper-scooper/buckeye-az/verrado/). Districts: ${hoodNames('verrado').join(', ')}.
- Full list: [Areas we serve](${ORIGIN}/pooper-scooper/).
- Coming soon: Surprise, Peoria, Glendale, Laveen, the Central and East Valley, Tucson, Flagstaff, Kingman and Lake Havasu City. Anyone outside our ZIP codes can join the waitlist. [[bf:Join by November 30, 2026 and the first month is free when we start in that area.||The first cleanup is free when we start in that area.]]

## Commercial pet waste removal (HOAs, apartments, dog parks, businesses)
- What: dog waste pickup in common areas plus pet waste station service (empty the can, new liner, refill bags, wipe and check the station, photo report after every visit). Any brand of station. Bags and liners included.
- Who: HOAs and master planned communities, apartment and build to rent communities, HOA and private dog parks, offices, vet clinics, groomers, boarding, hotels, property managers and events.
- Where: Buckeye (including Verrado), Goodyear, Litchfield Park, Citrus Park and Waddell.
- How often: most HOA common areas need one visit a week; dog parks and busy stations often need two; apartment relief areas two or three.
- Price: quoted after a free site walk, based on stations, ground to scoop, visits a week and drive time. Written quote within one business day. Month to month with 30 days notice. One bill on the 1st. Events quoted by the job.
- New stations: small station jobs under $1,000. Arizona Pet Waste is not a licensed contractor, so bigger installs go to a licensed contractor.
- Pages: [Commercial pet waste removal](${ORIGIN}/commercial-pet-waste-removal/), [HOAs](${ORIGIN}/commercial-pet-waste-removal/hoa/), [Apartments](${ORIGIN}/commercial-pet-waste-removal/apartments/), [Dog parks](${ORIGIN}/commercial-pet-waste-removal/dog-parks/), [Pet waste stations](${ORIGIN}/commercial-pet-waste-removal/pet-waste-stations/), [Events](${ORIGIN}/commercial-pet-waste-removal/events/).

## How a visit works
- Customers do not pick a day. We set each yard's day for them. We run set routes, and that keeps prices down. After sign up, we reach out to let the customer know their day and time.
- We text the night before with a 30 minute window.
- We shut the gate, pick up every pile front to back, and spray deodorizer where dogs go most.
- We latch the gate, pull on it, and send a photo.
- Something off? Tap "Something's off" in My Yard and we come back free within 24 hours.

## Local dog poop rules (plain summary)
- Buckeye (including Verrado): city code says animal waste cannot be left in an unsanitary way on public or private land, including your own yard. Verrado HOA rules say dog poop must be picked up right away anywhere in Verrado.
- Goodyear: city code says droppings must be removed from yards at least twice a week, and pets cannot cause flies, odor or piled up droppings. Up to four household pets per home.
- Litchfield Park: city code says dog owners must pick up poop right away in parks, on public land and on land they do not own, and put it in a closed bag in the trash.
- Unincorporated Maricopa County (Waddell, Citrus Park and county parts of 85340): dogs must be fenced or on a leash of 6 feet or less, and the county health code treats animal waste as refuse that must not breed insects.
- Everywhere: bag dog poop, tie the bag, and put it in the trash cart. Never in the recycle cart or a storm drain. Storm drain water is not treated.

## Before you hire a pooper scooper (our answers)
- Licensed, bonded and insured: yes.
- Owner: Juan Gonzalez, who lives in Verrado (Buckeye, AZ) with his wife and their six kids.
- Sign up fee: none. [[bf:The first month is free only with the Black Friday sale, for sign ups through November 30, 2026.||The first cleanup is free.]]
- Price per visit: weekly service is $108 a month for 1 or 2 dogs, about $25 a visit.
- Deodorizer spray: free at every visit.
- Proof: a text the night before, a live truck map on visit day, and a photo of the latched gate after every visit. A visit with no gate photo costs $0.
- Missed pile: free return within 24 hours.
- Waste: bagged and put in your trash can.
- Tools: boots and tools cleaned after every yard.
- Contract: none. 4 free skips a year. After the first 60 days, pause up to 120 days. Cancel in My Yard.[[bf: One free month per home.||]]
- My Yard: the customer account at ${ORIGIN}/account/. Sign in with an email code, no password. See next visits, skip a visit, pause, see bills and gate photos, change the card, or cancel. No phone call needed.
- Payment: secure checkout by Stripe. Arizona Pet Waste never sees or stores card numbers.

## Common questions
${faqText}

## Pages
${FILE_PAGES.filter((x) => x.type !== 'blogindex').map((x) => '- [' + x.h1 + '](' + ORIGIN + x.route + '): ' + x.description).join('\n')}${FILE_PAGES.length ? '\n' : ''}- [Home](${ORIGIN}/): plans, prices, how a visit works, service map
- [How it works](${ORIGIN}/how-it-works/): every step of a visit
- [About us](${ORIGIN}/about/): who we are, where we work, licensed, bonded and insured
- [Our promise](${ORIGIN}/our-promise/): gate photo or the visit is $0, free return in 24 hours, the 60 day rule
- [Contact](${ORIGIN}/contact/): call, text or email
- [Pricing](${ORIGIN}/pricing/): plans, extras and billing on the 1st
- [FAQ](${ORIGIN}/faq/): all of our answers
- [[[bf:Start your free month||Book now]]](${ORIGIN}/book/): sign up online in about 2 minutes
- [Areas we serve](${ORIGIN}/pooper-scooper/): every town and ZIP code we scoop
- [Buckeye](${ORIGIN}/pooper-scooper/buckeye-az/), [Goodyear](${ORIGIN}/pooper-scooper/goodyear-az/), [Litchfield Park](${ORIGIN}/pooper-scooper/litchfield-park-az/), [Citrus Park](${ORIGIN}/pooper-scooper/citrus-park-az/), [Verrado](${ORIGIN}/pooper-scooper/buckeye-az/verrado/): town pages
- [Privacy Policy](${ORIGIN}/privacy/)
- [Terms of Service](${ORIGIN}/terms/)
- [Text Message Terms](${ORIGIN}/texts/)
- [Accessibility](${ORIGIN}/accessibility/)

## Contact
- Call or text: 623.309.6104
- Office hours: 8 am to 5 pm, every day of the week (Arizona time)
- Email: ${cfg.email}
`);
fs.writeFileSync(path.join(DIST, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(self), payment=(self "https://js.stripe.com")
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/book/*
  X-Robots-Tag: noindex
/account/*
  X-Robots-Tag: noindex
/crew/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-cache
/t/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-cache
  Referrer-Policy: no-referrer
/staff-73d752e4/*
  X-Robots-Tag: noindex, nofollow, noarchive
  Referrer-Policy: no-referrer
`);
fs.writeFileSync(path.join(DIST, '_redirects'), `/staff /crew/ 301
/login /account/ 301
/login/ /account/ 301
/start/login /account/ 301
/my-yard /account/ 301
/signup /book/ 301
/start /book/ 301
/buckeye /pooper-scooper/buckeye-az/ 301
/buckeye/ /pooper-scooper/buckeye-az/ 301
/goodyear /pooper-scooper/goodyear-az/ 301
/goodyear/ /pooper-scooper/goodyear-az/ 301
/litchfield-park /pooper-scooper/litchfield-park-az/ 301
/litchfield-park/ /pooper-scooper/litchfield-park-az/ 301
/citrus-park /pooper-scooper/citrus-park-az/ 301
/citrus-park/ /pooper-scooper/citrus-park-az/ 301
/verrado /pooper-scooper/buckeye-az/verrado/ 301
/verrado/ /pooper-scooper/buckeye-az/verrado/ 301
/pooper-scooper/verrado-az /pooper-scooper/buckeye-az/verrado/ 301
/pooper-scooper/verrado-az/ /pooper-scooper/buckeye-az/verrado/ 301
/areas-we-serve /pooper-scooper/ 301
/areas-we-serve/ /pooper-scooper/ 301
/areas /pooper-scooper/ 301
/service-areas /pooper-scooper/ 301
/where-we-scoop /pooper-scooper/ 301
/estrella /pooper-scooper/goodyear-az/ 301
/sundance /pooper-scooper/buckeye-az/ 301
/waddell /pooper-scooper/citrus-park-az/ 301
/prices /pricing/ 301
/price /pricing/ 301
/how /how-it-works/ 301
/faqs /faq/ 301
/commercial /commercial-pet-waste-removal/ 301
/commercial/ /commercial-pet-waste-removal/ 301
/commercial-dog-waste-removal /commercial-pet-waste-removal/ 301
/commercial-dog-waste-removal/ /commercial-pet-waste-removal/ 301
/commercial-dog-waste-removal/pet-waste-stations/ /commercial-pet-waste-removal/pet-waste-stations/ 301
/commercial-dog-waste-removal/buckeye-az/ /commercial-pet-waste-removal/buckeye-az/ 301
/commercial-dog-waste-removal/goodyear-az/ /commercial-pet-waste-removal/goodyear-az/ 301
/commercial-dog-waste-removal/litchfield-park-az/ /commercial-pet-waste-removal/litchfield-park-az/ 301
/commercial-dog-waste-removal/citrus-park-az/ /commercial-pet-waste-removal/citrus-park-az/ 301
/commercial-dog-waste-removal/* /commercial-pet-waste-removal/:splat 301
/hoa-pet-waste-removal /commercial-pet-waste-removal/hoa/ 301
/pet-waste-stations /commercial-pet-waste-removal/pet-waste-stations/ 301
/dog-park-cleaning /commercial-pet-waste-removal/dog-parks/ 301
/questions /faq/ 301
`);
fs.copyFileSync(path.join(SRC, 'worker/worker.js'), path.join(DIST, '_worker.js'));
fs.writeFileSync(path.join(DIST, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*', '/t/*'], exclude: ['/t/'] }));
fs.writeFileSync(path.join(DIST, 'site.webmanifest'), JSON.stringify({
  name: cfg.name, short_name: 'AZ Pet Waste', start_url: '/', display: 'standalone', background_color: '#0A0F24', theme_color: '#0A0F24',
  icons: [{ src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png' }]
}, null, 1));

for (const b of built) console.log(`${b.index ? 'index  ' : 'noindex'} ${b.route.padEnd(18)} ${(b.bytes / 1024).toFixed(0).padStart(4)} KB`);
console.log('assets:', Object.values(assets).length, 'files. Output:', DIST);

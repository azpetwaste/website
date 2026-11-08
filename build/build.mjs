// Builds the Arizona Pet Waste website into dist/.
// Every page is rendered to real HTML here (for Google, AI search and fast first paint), then the same templates run in the browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, process.env.OUT_DIR || 'dist');
const DC = vm.runInThisContext('(function(){var module={exports:{}};' + fs.readFileSync(path.join(SRC, 'runtime/dc.js'), 'utf8') + '\nreturn module.exports;})()');

const cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'site.config.json'), 'utf8'));
const ORIGIN = (process.env.SITE_ORIGIN || cfg.origin).replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
const board = (id) => JSON.parse(fs.readFileSync(path.join(SRC, 'boards', id + '.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(SRC, 'boards/content.json'), 'utf8'));
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
const cfgForClient = { firstVisitFrom: cfg.firstVisitFrom, leadDays: cfg.leadDays, noVisitDays: cfg.noVisitDays };
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
  return DC.renderToString(doc, entry.markup, entry.Component, Object.assign({ theme: 'light' }, props));
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
// Neighborhood lists come from research/neighborhoods.json (each one checked against the service map).
const HOOD_EXTRA = { verrado: ['Village District'] };
const HOOD_GROUPS = {
  citrus: [
    { label: 'Waddell 85355', names: ['Citrus Park', 'Clearwater Farms', 'Montana Farms', 'Tara Estates'] },
    { label: 'Litchfield Park 85340 homes between Verrado and Citrus Road', names: ['Russell Ranch', 'Savannah', 'Windrose', 'Zanjero Trails (85340 homes)', 'Canyon Views'] }
  ]
};
const HOOD_NOTE = {
  citrus: 'Looking for the Citrus Park homes in Goodyear, south of Interstate 10? We do not scoop there yet. Type your ZIP when you book to join the waitlist.'
};
function hoodsHtml(area, name) {
  const found = ((hoods.areas || {})[area] || []).filter((x) => x.inside !== false).map((x) => x.name);
  const names = found.concat(HOOD_EXTRA[area] || []);
  if (!names.length) return '';
  const chips = (list) => '<ul class="hoods">' + list.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>';
  const groups = HOOD_GROUPS[area];
  const body = groups
    ? groups.map((g) => '<p class="mono" style="margin: 16px 0 0; font-size: 13px; font-weight: 600; letter-spacing: .06em; color: var(--mute);">' + esc(g.label.toUpperCase()) + '</p>' + chips(g.names)).join('')
    : chips(names);
  const title = groups ? 'Neighborhoods we scoop around ' + name : 'Neighborhoods we scoop in ' + name;
  return '<div style="margin-top: 26px;"><h3 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -.02em; line-height: 1.2; color: var(--ink);">' + esc(title) + '</h3>' + body +
    '<p style="margin: 12px 0 0; font-size: 15px; line-height: 1.55; color: var(--ink2);">' + esc(HOOD_NOTE[area] || 'Not sure about your street? Type your ZIP when you book and we will tell you right away.') + '</p></div>';
}
function hoodNames(area) {
  const groups = HOOD_GROUPS[area];
  if (groups) return groups.flatMap((g) => g.names);
  return ((hoods.areas || {})[area] || []).filter((x) => x.inside !== false).map((x) => x.name).concat(HOOD_EXTRA[area] || []);
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
[id]{scroll-margin-top:76px}
#book-dock{display:none}
html.book-open{overflow:hidden}
html.book-open #book-dock{display:block;position:fixed;inset:0;z-index:60;background:#070B1B}
#book-dock>.apw{height:100%}
@keyframes dockPulse{0%{box-shadow:0 0 0 0 rgba(255,74,28,.75)}100%{box-shadow:0 0 0 22px rgba(255,74,28,0)}}
@media (min-width:1100px){
.site{display:grid;grid-template-columns:minmax(0,440px) 400px;gap:40px;justify-content:center;align-items:start;padding:0 24px}
#app{min-width:0}
#book-dock{display:block;position:sticky;top:24px;height:min(880px,calc(100vh - 48px));margin:24px 0;border-radius:26px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}
html.book-open{overflow:auto}
html.book-open #book-dock{position:sticky;inset:auto;z-index:auto}
#book-dock.pulse{animation:dockPulse .9s ease-out 2}
#book-dock .bk-x{visibility:hidden}
.sbar{display:none!important}
}
.bookpage #app{height:100vh;height:100dvh}
@media (min-width:600px){.bookpage #app{width:430px;height:min(900px,calc(100dvh - 48px));margin:24px auto;border-radius:26px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}}
.apw .hoods{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}
.apw .hoods li{padding:8px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:15px;font-weight:600;color:var(--ink)}
.apw .doc{padding:30px 20px 60px;background:var(--bg);color:var(--ink)}
.apw .doc .dh1{margin:10px 0 0;font-size:40px}
.apw .doc h2{margin:34px 0 0;font-size:24px;font-weight:800;letter-spacing:-.03em;line-height:1.15;color:var(--ink)}
.apw .doc h3{margin:22px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.apw .doc p,.apw .doc li{font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .doc p{margin:12px 0 0}
.apw .doc ul,.apw .doc ol{margin:12px 0 0;padding-left:22px}
.apw .doc li{margin-top:6px}
.apw .doc a{color:var(--accent-text);font-weight:700}
.apw .doc strong{color:var(--ink)}
.apw .doc .updated{margin-top:14px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px;color:var(--mute)}
.apw .doc .lead{font-size:19px;line-height:1.55;color:var(--ink)}
.apw .doc .tocd{margin:18px 0 0;padding:4px 16px 14px;border-radius:16px;background:var(--bg2);border:1px solid var(--line)}
.apw .doc .tocd summary{display:flex;align-items:center;min-height:44px;font-weight:800;color:var(--ink);cursor:pointer}
.apw .doc .toc{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 0;padding:0;list-style:none}
.apw .doc .toc a{display:inline-flex;align-items:center;min-height:40px;padding:0 12px;border-radius:999px;background:var(--bg2);border:1px solid var(--line);font-size:14px;color:var(--ink);text-decoration:none}
.skip{position:absolute;left:12px;top:-60px;z-index:100;padding:12px 16px;border-radius:12px;background:#FF4A1C;color:#0E1430;font:700 16px system-ui,sans-serif;text-decoration:none}
.skip:focus{top:12px}
@media (prefers-reduced-motion:reduce){#book-dock.pulse{animation:none}}`;

// ---------- structured data ----------
const BIZ = ORIGIN + '/#business';
const PLACES = {
  verrado: { name: 'Verrado', locality: 'Buckeye', zip: '85396', url: '/verrado/' },
  citrus: { name: 'Citrus Park', locality: 'Waddell', zip: '85355', url: '/citrus-park/' },
  goodyear: { name: 'Goodyear (north of Interstate 10)', locality: 'Goodyear', zip: '85395', url: '/goodyear/' },
  litchfield: { name: 'Litchfield Park', locality: 'Litchfield Park', zip: '85340', url: '/litchfield-park/' }
};
const place = (p) => ({ '@type': 'Place', name: p.name + ', AZ ' + p.zip, address: { '@type': 'PostalAddress', addressLocality: p.locality, addressRegion: 'AZ', postalCode: p.zip, addressCountry: 'US' } });
const monthly = (name, price, desc) => ({
  '@type': 'Offer', name, description: desc, price: price.toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock',
  priceSpecification: { '@type': 'UnitPriceSpecification', price: price.toFixed(2), priceCurrency: 'USD', unitText: 'MONTH', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
  itemOffered: { '@type': 'Service', name: name, provider: { '@id': BIZ } }
});
const OFFERS = [
  monthly('Dog poop pickup every week', 108, 'For 1 or 2 dogs. About $25 a visit. Each dog after two adds $13 a month. First month free.'),
  monthly('Dog poop pickup twice a week', 189, 'For 1 or 2 dogs. Each dog after two adds $13 a month. First month free.'),
  monthly('Dog poop pickup every other week', 75, 'For 1 or 2 dogs. Each dog after two adds $9 a month. First month free.'),
  { '@type': 'Offer', name: 'Turf odor treatment', price: '35.00', priceCurrency: 'USD', itemOffered: { '@type': 'Service', name: 'Turf odor treatment' } },
  { '@type': 'Offer', name: 'One time yard cleanup', price: '95.00', priceCurrency: 'USD', itemOffered: { '@type': 'Service', name: 'One time dog poop cleanup' } }
];
const business = {
  '@type': 'LocalBusiness', '@id': BIZ, name: cfg.name, url: ORIGIN + '/',
  description: 'Dog poop pickup and pet waste removal for homes in Verrado (Buckeye), Citrus Park (Waddell), Goodyear north of Interstate 10, and Litchfield Park, Arizona. Weekly, twice a week, or every other week. First month free, free sanitizer spray at every visit, and a photo of your latched gate after each visit.',
  telephone: '+1-623-309-6104', email: cfg.email,
  logo: ORIGIN + '/assets/img/icon-512.png', image: ORIGIN + '/assets/img/og.png',
  priceRange: '$75 to $189 a month', currenciesAccepted: 'USD', paymentAccepted: 'Credit card, debit card, Apple Pay, Google Pay',
  areaServed: Object.values(PLACES).map(place),
  knowsAbout: ['Dog poop pickup', 'Pet waste removal', 'Pooper scooper service', 'Artificial turf odor treatment', 'Yard sanitizing'],
  slogan: 'You always know. Or you don’t pay.',
  hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Dog poop pickup plans', itemListElement: OFFERS }
};
if (cfg.sameAs.length) business.sameAs = cfg.sameAs;
const website = { '@type': 'WebSite', '@id': ORIGIN + '/#website', url: ORIGIN + '/', name: cfg.name, publisher: { '@id': BIZ }, inLanguage: 'en-US' };
const faqLd = (url, items) => ({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: items.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) });
const crumbs = (url, trail) => ({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[0], item: ORIGIN + t[1] })) });

// ---------- pages ----------
const FONTS_PRE = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
function page(p) {
  const url = ORIGIN + p.route;
  const robots = p.index ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow';
  const graph = p.index ? [website, business, { '@type': 'WebPage', '@id': url + '#webpage', url, name: p.title, description: p.description, isPartOf: { '@id': ORIGIN + '/#website' }, about: { '@id': BIZ }, inLanguage: 'en-US', dateModified: TODAY }, ...(p.ld || [])] : null;
  const css = p.css.join('\n') + '\n' + SITE_CSS;
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
<meta property="og:image:alt" content="Arizona Pet Waste. Dog poop pickup you can watch. First month free.">
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
<script>try{if(localStorage.getItem('apw.theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}</script>
<style>${css}</style>
${graph ? `<script type="application/ld+json">${ldjson({ '@context': 'https://schema.org', '@graph': graph })}</script>` : ''}
</head>
<body${p.bodyClass ? ` class="${p.bodyClass}"` : ''}>
<a class="skip" href="#app">Skip to content</a>
<div class="site">
<div id="app" data-board="${p.board}">${p.body}</div>
${p.dock ? `<aside id="book-dock" aria-label="Start your free month">${p.dock}</aside>` : ''}
</div>
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
    title: 'Dog Poop Pickup in the West Valley AZ | Arizona Pet Waste',
    ogTitle: 'Dog poop pickup you can watch | Arizona Pet Waste',
    description: 'Weekly dog poop pickup in Verrado, Citrus Park, Goodyear and Litchfield Park. First month free, free sanitizer spray, and a gate photo after every visit.',
    fonts: e.b.fonts, css: [e.b.css, bookDock.b.css.replace(content.base_css, '')], boards: [e, bookDock],
    body: ssr(e), dock: dockHtml,
    ld: [faqLd(url, content.faq.main), {
      '@type': 'Service', '@id': url + '#service', name: 'Dog poop pickup', serviceType: 'Pet waste removal', provider: { '@id': BIZ },
      areaServed: Object.values(PLACES).map(place), offers: { '@type': 'AggregateOffer', lowPrice: '75.00', highPrice: '189.00', priceCurrency: 'USD', offerCount: 3 }
    }]
  }));
}

// towns
const TOWNS = [
  { area: 'verrado', board: 'city-verrado', route: '/verrado/', title: 'Dog Poop Pickup in Verrado, Buckeye AZ | Arizona Pet Waste',
    description: 'Weekly dog poop pickup for Verrado homes in Buckeye, AZ 85396. First month free, free sanitizer spray, a live truck map and a photo of your latched gate.' },
  { area: 'citrus', board: 'city-citrus', route: '/citrus-park/', title: 'Dog Poop Pickup in Citrus Park AZ | Arizona Pet Waste',
    description: 'Weekly dog poop pickup in Citrus Park and Waddell, AZ 85355, including Zanjero Trails. First month free, free sanitizer spray and a gate photo every visit.' },
  { area: 'goodyear', board: 'city-goodyear', route: '/goodyear/', title: 'Dog Poop Pickup in Goodyear AZ | Arizona Pet Waste',
    description: 'Weekly dog poop pickup in Goodyear north of Interstate 10, ZIP 85395. First month free, free sanitizer spray, a live truck map and a photo of your gate.' },
  { area: 'litchfield', board: 'city-litchfield', route: '/litchfield-park/', title: 'Dog Poop Pickup in Litchfield Park AZ | Arizona Pet Waste',
    description: 'Weekly dog poop pickup in Litchfield Park, AZ 85340. First month free, free sanitizer spray, a live truck map and a photo of your latched gate after each visit.' }
];
for (const t of TOWNS) {
  const c = content.cities[t.area];
  const e = useBoard(t.board, (m) => slots(m, (x) => x.replace('<!--HOODS-->', hoodsHtml(t.area, c.name))));
  const url = ORIGIN + t.route;
  built.push(page({
    route: t.route, board: t.board, index: true, title: t.title, description: t.description,
    fonts: e.b.fonts, css: [e.b.css, bookDock.b.css.replace(content.base_css, '')], boards: [e, bookDock],
    body: ssr(e), dock: dockHtml,
    ld: [faqLd(url, c.faq), crumbs(url, [['Home', '/'], ['Where we scoop', '/#where'], [c.name, t.route]]), {
      '@type': 'Service', '@id': url + '#service', name: 'Dog poop pickup in ' + c.name, serviceType: 'Pet waste removal', provider: { '@id': BIZ },
      areaServed: [place(PLACES[t.area])].concat(hoodNames(t.area).map((n) => ({ '@type': 'Place', name: n.replace(/ \(.*\)$/, '') + ', AZ' }))), description: c.intro, offers: { '@type': 'AggregateOffer', lowPrice: '75.00', highPrice: '189.00', priceCurrency: 'USD', offerCount: 3 }
    }]
  }));
}

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
    route: '/book/', board: 'book', index: false, bodyClass: 'bookpage', title: 'Start Your Free Month | Arizona Pet Waste',
    description: 'Sign up for dog poop pickup in Verrado, Citrus Park, Goodyear and Litchfield Park. Your first month is free.',
    fonts: e.b.fonts, css: [e.b.css], boards: [e], body: ssr(e, { mode: 'page' })
  }));
  const a = useBoard('account');
  built.push(page({
    route: '/account/', board: 'account', index: false, title: 'My Yard | Arizona Pet Waste',
    description: 'Sign in to My Yard to set up your gate code, see your plan and manage your card.',
    fonts: a.b.fonts, css: [a.b.css], boards: [a], body: ssr(a)
  }));
  const nf = useBoard('doc', (mk) => slots(mk).replace('@@DOC@@', '<p class="eb">Arizona Pet Waste</p><h1 class="h1 dh1">We could not find that page<span style="color: var(--accent);">.</span></h1>' +
    '<p class="lead">The link may be old. These pages can help.</p><ul><li><a href="/">Home</a></li><li><a href="/book/">Start your free month</a></li><li><a href="/verrado/">Verrado</a></li><li><a href="/citrus-park/">Citrus Park</a></li><li><a href="/goodyear/">Goodyear</a></li><li><a href="/litchfield-park/">Litchfield Park</a></li></ul>'));
  built.push(page({
    route: '/404.html', board: 'doc', index: false, title: 'Page Not Found | Arizona Pet Waste', description: 'We could not find that page.',
    fonts: nf.b.fonts, css: [nf.b.css], boards: [nf], body: ssr(nf)
  }));
}

// ---------- search and AI files ----------
const indexed = built.filter((b) => b.index);
const priority = (r) => (r === '/' ? '1.0' : r.length < 20 && !['/privacy/', '/terms/', '/texts/', '/accessibility/'].includes(r) ? '0.9' : '0.3');
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

> Dog poop pickup (pet waste removal) for homes in Arizona's West Valley: Verrado in Buckeye (85396), Citrus Park in Waddell (85355), Goodyear north of Interstate 10 (85395) and Litchfield Park (85340). Weekly, twice a week or every other week. First month free. Free sanitizer spray at every visit. A photo of your latched gate after every visit, and a live map of our truck on visit day. No contract.

## Prices (per month)
- Every week: $108 for 1 or 2 dogs (about $25 a visit). Each dog after two adds $13.
- Twice a week: $189 for 1 or 2 dogs. Each dog after two adds $13.
- Every other week: $75 for 1 or 2 dogs. Each dog after two adds $9.
- Turf odor treatment: $35. One time cleanup: $95.
- First month free on any plan. A card is saved at sign up and first charged one month after the first visit.

## Service area
- [Verrado, Buckeye AZ 85396](${ORIGIN}/verrado/). Neighborhoods: ${hoodNames('verrado').join(', ')}.
- [Citrus Park, Waddell AZ 85355](${ORIGIN}/citrus-park/), plus Litchfield Park 85340 homes between Verrado and Citrus Road. Neighborhoods: ${hoodNames('citrus').join(', ')}.
- [Goodyear AZ 85395, north of Interstate 10](${ORIGIN}/goodyear/). Neighborhoods: ${hoodNames('goodyear').join(', ')}.
- [Litchfield Park AZ 85340](${ORIGIN}/litchfield-park/). Neighborhoods: ${hoodNames('litchfield').join(', ')}.
- Not served yet: Goodyear south of Interstate 10 (for example Estrella, Canyon Trails and the Citrus Park homes in Goodyear).

## How a visit works
- We text the night before with a 30 minute window.
- We shut the gate, pick up every pile front to back, and spray sanitizer where dogs go most.
- We latch the gate, pull on it, and send a photo.
- Something off? Tap "Something's off" in My Yard and we come back free within 24 hours.

## Common questions
${faqText}

## Pages
- [Home](${ORIGIN}/): plans, prices, how a visit works, service map
- [Start your free month](${ORIGIN}/book/): sign up online in about 2 minutes
- [Privacy Policy](${ORIGIN}/privacy/)
- [Terms of Service](${ORIGIN}/terms/)
- [Text Message Terms](${ORIGIN}/texts/)
- [Accessibility](${ORIGIN}/accessibility/)

## Contact
- Call or text: 623.309.6104
- Email: ${cfg.email}
`);
fs.writeFileSync(path.join(DIST, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")
  Strict-Transport-Security: max-age=31536000; includeSubDomains
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/book/*
  X-Robots-Tag: noindex
/account/*
  X-Robots-Tag: noindex
`);
fs.writeFileSync(path.join(DIST, '_redirects'), `/login /account/ 301
/login/ /account/ 301
/start/login /account/ 301
/my-yard /account/ 301
/signup /book/ 301
/start /book/ 301
/buckeye /verrado/ 301
/waddell /citrus-park/ 301
/zanjero-trails /citrus-park/ 301
`);
fs.copyFileSync(path.join(SRC, 'worker/worker.js'), path.join(DIST, '_worker.js'));
fs.writeFileSync(path.join(DIST, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
fs.writeFileSync(path.join(DIST, 'site.webmanifest'), JSON.stringify({
  name: cfg.name, short_name: 'AZ Pet Waste', start_url: '/', display: 'standalone', background_color: '#0A0F24', theme_color: '#0A0F24',
  icons: [{ src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png' }]
}, null, 1));

for (const b of built) console.log(`${b.index ? 'index  ' : 'noindex'} ${b.route.padEnd(18)} ${(b.bytes / 1024).toFixed(0).padStart(4)} KB`);
console.log('assets:', Object.values(assets).length, 'files. Output:', DIST);

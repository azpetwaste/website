// Designed layout for the commercial pages and the service area hub.
// A content file with "layout":"biz" in its JSON header gets a dark hero, a quick answers card,
// designed sections, an FAQ accordion and a quote band. Body HTML can use the blocks below,
// and these markers, which expand to shared sections:
//   <!--SERVICES--> service cards   <!--AREAS--> map and town cards   <!--INCLUDES--> what every visit includes
//   <!--STEPS--> how it works       <!--ASK--> questions to ask a company   <!--RULES--> local dog waste rules
//   <!--TOWNS--> town links strip   <!--RELATED--> other services and towns

export const PHONE = '623.309.6104';
const TEL = 'tel:+16233096104', SMS = 'sms:+16233096104', MAIL = 'mailto:info@arizonapetwaste.com?subject=Commercial%20quote';
export const HUB = '/commercial-pet-waste-removal/';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = (body, cls) => `<svg class="${cls || 'bxsvg'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  hoa: svg('<path d="M3 11.5 8 7.5l5 4V20H3z"/><path d="M13 11.5 17 8.5l4 3V20h-8"/><path d="M6.5 20v-4h3v4"/><path d="M16 14h2"/>'),
  apt: svg('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M11 21v-3h2v3"/>'),
  park: svg('<circle cx="7" cy="9.5" r="1.7"/><circle cx="10.6" cy="6.4" r="1.7"/><circle cx="14.8" cy="6.4" r="1.7"/><circle cx="18" cy="9.8" r="1.7"/><path d="M8.2 16.6c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6c0 2-1.5 3-3 3-.9 0-1.3-.5-1.5-.5s-.6.5-1.5.5c-1.5 0-3-1-3-3z"/>'),
  station: svg('<path d="M8 3v18"/><rect x="8" y="4" width="9" height="6.5" rx="1.2"/><path d="M11 10.5V13h3v-2.5"/><path d="M4 21h16"/><path d="M13.5 15h6l-1 6h-4z"/>'),
  event: svg('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/><path d="M9 21h-6"/>'),
  biz: svg('<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5h16"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/><path d="M10 20v-4.5h4V20"/>'),
  phone: svg('<path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>', 'bxbi'),
  text: svg('<path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 10.5h8"/>', 'bxbi'),
  mail: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/>', 'bxbi'),
  check: svg('<path d="m5 12.5 4.2 4.2L19 7"/>', 'bxck'),
  germ: svg('<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.9 2.9M15.5 15.5l2.9 2.9M5.6 18.4l2.9-2.9M15.5 8.5l2.9-2.9"/>'),
  rain: svg('<path d="M7 15.5a4.5 4.5 0 1 1 1.4-8.8A5.5 5.5 0 0 1 19 9a3.5 3.5 0 0 1-1 6.5H7z"/><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21"/>'),
  chat: svg('<path d="M4 5h16v10h-9l-5 4v-4H4z"/><path d="M9 9.5h.01M12 9.5h.01M15 9.5h.01"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  map: svg('<path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  ruler: svg('<path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>'),
  truck: svg('<path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5h4l3 3v3h-7"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>'),
  bag: svg('<path d="M6 8.5h12l-1 12H7z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/><path d="m9 12 2 2 4-4"/>', 'bxbi')
};

export const SERVICES = [
  { key: 'hoa', href: HUB + 'hoa/', name: 'HOA common areas', go: 'HOA pet waste removal', text: 'Greenbelts, trails, parks and mailbox clusters, scooped on a set day with a photo report for the board.' },
  { key: 'apt', href: HUB + 'apartments/', name: 'Apartments', go: 'Apartment pet waste management', text: 'Pet relief areas, dog runs and the grass by each building, kept clean for residents and tours.' },
  { key: 'park', href: HUB + 'dog-parks/', name: 'Dog parks', go: 'Dog park cleaning', text: 'The whole park scooped, cans emptied and bags refilled. Early mornings all summer.' },
  { key: 'station', href: HUB + 'pet-waste-stations/', name: 'Pet waste stations', go: 'Pet waste station service', text: 'We empty, reline, restock and check any brand of station. New stations too.' },
  { key: 'event', href: HUB + 'events/', name: 'Events', go: 'Event pet waste cleanup', text: 'Loaner stations, a scooper on site while it runs and a sweep of the grounds after.' },
  { key: 'biz', href: HUB + '#businesses', name: 'Businesses', go: 'Offices, vets and hotels', text: 'Offices, vet clinics, groomers, boarding, hotels and stores with turf or grass by the door.' }
];

export const TOWNS = [
  { key: 'buckeye', name: 'Buckeye', zips: ['85326', '85396'], href: HUB + 'buckeye-az/', res: '/pooper-scooper/buckeye-az/', places: 'Verrado, Sundance, Tartesso, Festival Foothills and Teravalis' },
  { key: 'goodyear', name: 'Goodyear', zips: ['85338', '85395'], href: HUB + 'goodyear-az/', res: '/pooper-scooper/goodyear-az/', places: 'Estrella, PebbleCreek, Palm Valley, Canyon Trails and Centerra' },
  { key: 'litchfield', name: 'Litchfield Park', zips: ['85340'], href: HUB + 'litchfield-park-az/', res: '/pooper-scooper/litchfield-park-az/', places: 'Litchfield Greens, Wigwam Creek and Dreaming Summit' },
  { key: 'citrus', name: 'Citrus Park and Waddell', zips: ['85355'], href: HUB + 'citrus-park-az/', res: '/pooper-scooper/citrus-park-az/', places: 'Sentiero at Windrose, Zanjero Pass and White Tank Foothills' }
];

// Section headings are plain: no small label above them and no colored period after them (Nov 2026 redesign).
const dot = '';
export const h2 = (id, text) => `<h2 id="${id}">${text}</h2>`;

// ---------- shared sections ----------
export function servicesBlock(skip) {
  return '<div class="bxcards">' + SERVICES.filter((s) => s.key !== skip).map((s) =>
    `<a class="bxcard" href="${s.href}"><span class="bxi">${ICONS[s.key]}</span><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p><span class="bxgo">${esc(s.go)}</span></a>`).join('') + '</div>';
}
export function townCards(focus) {
  return '<div class="bxtowns">' + TOWNS.map((t) =>
    `<a class="bxtown${t.key === focus ? ' on' : ''}" href="${t.href}"><span class="bxtown-n">${esc(t.name)}</span>` +
    `<span class="bxzips">${t.zips.map((z) => '<i>' + z + '</i>').join('')}</span>` +
    `<span class="bxtown-p">${esc(t.places)}</span><span class="bxgo">Commercial service in ${esc(t.name.replace(' and Waddell', ''))}</span></a>`).join('') + '</div>';
}
export function mapBox(svgMarkup, focusHref) {
  const style = focusHref ? `<style>.bxmap a[href="${focusHref}"] .mlink{fill:rgba(255,74,28,.30)}</style>` : '';
  return `<div class="bxmap">${style}${svgMarkup}<p class="bxmap-key"><i></i>The orange lines are the ZIP codes we serve. Tap a town.</p></div>`;
}
export function areasBlock(svgMarkup, focus) {
  const t = TOWNS.find((x) => x.key === focus);
  return '<div class="bxareas">' + mapBox(svgMarkup, t && t.href) + townCards(focus) + '</div>' +
    '<p class="bxnote">Close by but outside these towns? Call anyway. We are adding routes across the Valley. Need it for your home? See our <a href="/pooper-scooper/">residential service areas</a>.</p>';
}
export function townsStrip(focus) {
  return '<ul class="bxchips">' + TOWNS.map((t) => `<li><a href="${t.href}"${t.key === focus ? ' aria-current="page"' : ''}>${esc(t.name)}<span>${t.zips.join(' and ')}</span></a></li>`).join('') + '</ul>';
}
export const INCLUDES = [
  ['Scoop every common area', 'Grass, rock, turf, trails and dog parks on your route, walked in a pattern so nothing gets skipped.'],
  ['Empty every station', 'We tie off the full liner, put in a new one and haul the bag to your dumpster.'],
  ['Refill the bags', 'Bags and liners are part of your price. You never buy them.'],
  ['Check each station', 'We wipe the can, lid and sign, and look over the post and dispenser.'],
  ['Tell you what is broken', 'A loose lid, a bent post or a missing sign goes in your report.'],
  ['Send a photo report', 'Photos after every visit, by text or email, to your board or manager.']
];
export function includesBlock(items) {
  return '<ul class="bxcheck">' + (items || INCLUDES).map(([a, b]) => `<li>${ICONS.check}<div><b>${esc(a)}</b><span>${esc(b)}</span></div></li>`).join('') + '</ul>';
}
export const STEPS = [
  ['Call, text or email', 'Tell us about your site. ' + PHONE + ' reaches a real person.'],
  ['Free site walk', 'We count the stations and time the walk through each common area.'],
  ['Written quote', 'You get it within one business day. Month to month, with 30 days notice.'],
  ['Set day each week', 'We start on your day, send a photo report after each visit and bill once on the 1st.']
];
export function stepsBlock() {
  return '<ol class="bxsteps">' + STEPS.map(([a, b], i) => `<li><span class="bxn">${i + 1}</span><h3>${esc(a)}</h3><p>${esc(b)}</p></li>`).join('') + '</ol>';
}
export const ASK = [
  ['Are you bonded and insured?', '[[ins:We are bonded today. We carry a $50,000 business service bond. Our $1,000,000 general liability insurance starts November 16, 2026.||Yes. We carry a $50,000 business service bond and $1,000,000 in general liability insurance.]] Ask and we send a certificate of insurance.'],
  ['Do you send proof after every visit?', 'Yes. You get a photo report after each visit.'],
  ['Are bags and liners included?', 'Yes. They are part of your price.'],
  ['Do we have to sign a contract?', 'No. Plans are month to month with 30 days notice.'],
  ['Can you service the stations we already have?', 'Yes. Any brand, any age.'],
  ['Where does the waste go?', 'Bagged and put in your dumpster or trash cans, with your OK.'],
  ['Who do we call if something is missed?', 'Call or text ' + PHONE + '. A real person answers.']
];
export function askBlock() {
  return '<div class="bxtable-wrap"><table class="bxtable"><thead><tr><th scope="col">Ask any company</th><th scope="col">Our answer</th></tr></thead><tbody>' +
    ASK.map(([q, a]) => `<tr><th scope="row">${esc(q)}</th><td>${esc(a)}</td></tr>`).join('') + '</tbody></table></div>';
}
export const RULES = [
  ['Buckeye', 'City code says animal waste cannot be left in a way that is not clean, on public land or private land. Off your own property, dogs must be on a leash.'],
  ['Goodyear', 'City code says droppings must be removed from yards at least twice a week, and pets cannot cause flies, smell or piles of droppings.'],
  ['Litchfield Park', 'City code says dog waste must be picked up right away in parks, on public land and on land you do not own, then go in a closed bag in the trash.'],
  ['Citrus Park and Waddell', 'Maricopa County rules apply. The county health code says animal waste must be handled so it does not breed insects.']
];
export function rulesBlock(only) {
  return '<div class="bxrules">' + RULES.filter((r) => !only || r[0] === only).map(([t, x]) => `<div class="bxrule"><p class="bxrule-t">${esc(t)}</p><p>${esc(x)}</p></div>`).join('') + '</div>' +
    '<p class="bxnote">Most HOAs add their own pickup rules on top of these. This is a plain summary, not legal advice.</p>';
}
export function relatedBlock(skipService, focusTown) {
  return '<div class="bxrel"><div><p class="bxrel-t">More commercial services</p><ul class="bxchips">' +
    SERVICES.filter((s) => s.key !== skipService && s.key !== 'biz').map((s) => `<li><a href="${s.href}">${esc(s.name)}</a></li>`).join('') +
    `<li><a href="${HUB}">All commercial services</a></li></ul></div>` +
    '<div><p class="bxrel-t">Areas we serve</p>' + townsStrip(focusTown) + '</div></div>';
}

// ---------- page pieces ----------
function crumbsNav(trail) {
  return '<nav aria-label="Breadcrumb"><ol class="bxcr">' + trail.map(([n, r], i) =>
    i === trail.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${r}">${esc(n)}</a></li>`).join('') + '</ol></nav>';
}
const tile = (art, cap) => `<span class="bxr-ph"><svg viewBox="0 0 120 90" aria-hidden="true">${art}</svg><i>${cap}</i></span>`;
const ART = {
  station: '<rect width="120" height="90" fill="#BFD8A8"/><rect y="62" width="120" height="28" fill="#A9C98E"/><rect x="52" y="20" width="5" height="56" rx="2" fill="#2F3B5C"/><rect x="44" y="18" width="24" height="17" rx="3" fill="#2E7D4F"/><rect x="50" y="35" width="12" height="4" fill="#1E5A37"/><rect x="60" y="52" width="20" height="24" rx="3" fill="#2E7D4F"/><rect x="58" y="49" width="24" height="5" rx="2" fill="#1E5A37"/><circle cx="96" cy="16" r="9" fill="#FFD27A"/>',
  path: '<rect width="120" height="90" fill="#E9D9BC"/><path d="M0 90C30 60 70 55 120 30V90z" fill="#C9B48F"/><path d="M38 90C52 66 80 52 120 40v14C88 62 64 72 58 90z" fill="#F5EBD8"/><circle cx="22" cy="30" r="10" fill="#7FA36B"/><rect x="21" y="38" width="3" height="10" fill="#6B5A44"/><circle cx="92" cy="18" r="7" fill="#7FA36B"/>',
  park: '<rect width="120" height="90" fill="#CFE3B5"/><rect y="58" width="120" height="32" fill="#B5D396"/><path d="M8 58V36M28 58V36M48 58V36M68 58V36M88 58V36M108 58V36M2 42h116M2 52h116" stroke="#5B6B8C" stroke-width="2.5"/><circle cx="86" cy="72" r="5" fill="#C08552"/><rect x="78" y="70" width="14" height="7" rx="3" fill="#C08552"/>'
};
function reportCard(site) {
  const row = (ok, a, b) => `<li><span class="${ok ? 'bxr-ok' : 'bxr-warn'}">${ok ? '✓' : '!'}</span>${a}<b>${b}</b></li>`;
  return '<figure class="bxr" aria-label="Sample photo report">' +
    '<div class="bxr-top"><span class="bxr-live"><i></i>Visit report</span><span class="bxr-tag">Sample</span></div>' +
    `<p class="bxr-site">${esc(site || 'Greenbelt, trail and dog park')}</p><p class="bxr-time">Tuesday, 7:42 AM</p>` +
    '<div class="bxr-photos">' + tile(ART.station, 'Station 2') + tile(ART.path, 'Trail') + tile(ART.park, 'Dog park') + '</div>' +
    '<ul class="bxr-list">' + row(true, 'Common areas scooped', '4 of 4') + row(true, 'Stations emptied and relined', '6 of 6') +
    row(true, 'Bag rolls refilled', '6 of 6') + row(false, 'Lid is loose on station 4', 'Reported') + '</ul>' +
    '<figcaption class="bxr-foot">Sent to your board and manager by text or email</figcaption></figure>';
}
export function ctaButtons(primary) {
  return `<div class="bxh-cta"><a class="btn btn-dot" href="${TEL}">${ICONS.phone}${primary || 'Call ' + PHONE}</a>` +
    `<a class="btn btn-line-n" href="${SMS}">${ICONS.text}Text us</a><a class="btn btn-line-n" href="${MAIL}">${ICONS.mail}Email</a></div>`;
}
const SEAL = (() => {
  const n = 14, r = 19.2;
  let bumps = '';
  for (let i = 0; i < n; i++) bumps += `<circle cx="${(24 + r * Math.cos(2 * Math.PI * i / n)).toFixed(2)}" cy="${(24 + r * Math.sin(2 * Math.PI * i / n)).toFixed(2)}" r="4.4"></circle>`;
  return `<svg class="bxseal" viewBox="0 0 48 48" aria-hidden="true"><g fill="#FF4A1C"><circle cx="24" cy="24" r="19.6"></circle>${bumps}</g><circle cx="24" cy="24" r="15.4" fill="none" stroke="#0A0F24" stroke-width="1.3" opacity=".5"></circle><path d="M16.2 24.6l5.4 5.4 10.4-11.2" fill="none" stroke="#0A0F24" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
})();
export function hero(pg, trail) {
  const h = pg.hero || {};
  // each fact is [number, unit, what it means]: "1 day. Written quote after your free site walk."
  const stats = h.stats || [['1', 'day', 'Written quote after your free site walk'], ['1', 'report', 'With photos after every visit'], ['0', 'contracts', 'Month to month, 30 days notice']];
  const trust = (h.trust || 'Free site walk').replace(/^Bonded and insured · /, '');
  return '<section class="bxh"><div class="bxw"><div class="bxh-in"><div class="bxh-copy">' + crumbsNav(trail) +
    `<h1>${esc(pg.h1)}</h1><p class="lead">${h.lead || ''}</p>` +
    (h.ctaHtml || ctaButtons(h.cta)) +
    (trust ? `<p class="bxtrust">${esc(trust)}</p>` : '') +
    '<ul class="bxbadges" aria-label="[[ins:Bonded and background checked. Insurance starts November 16.||Bonded, insured and background checked]]">' + [['Bonded', '$50,000 bond'], ['[[ins:Insurance||Insured]]', '[[ins:$1,000,000, starts Nov 16||$1,000,000 liability]]'], ['Background checked', 'Every team member']].map(([a, b]) => `<li>${SEAL}<span><b>${a}</b><small>${b}</small></span></li>`).join('') + '</ul>' +
    '<ul class="bxh-stats">' + stats.map(([n, u, t]) => `<li><b>${esc(n)} ${esc(u)}</b><span>${esc(t)}</span></li>`).join('') + '</ul>' +
    '</div><div class="bxh-side">' + (h.side || reportCard(h.site)) + '</div></div></div></section>';
}
export function quick(facts, title) {
  if (!facts || !facts.length) return '';
  return '<div class="bxw"><section class="bxq" aria-labelledby="quick-answers"><h2 id="quick-answers" class="bxq-h">' + (title || 'Quick answers') + '</h2><dl class="bxq-dl">' +
    facts.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${b}</dd></div>`).join('') + '</dl></section></div>';
}
export function faqBlock(faq, title, alt) {
  if (!faq || !faq.length) return '';
  return '<section class="bxs' + (alt ? ' bxalt' : '') + '" id="questions"><div class="bxw bxfaq-w">' + h2('questions-h', title || 'Questions') + '<div class="bxfaq">' +
    faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><h3>${esc(q)}</h3><span class="bxpm" aria-hidden="true"></span></summary><p>${esc(a)}</p></details>`).join('') +
    '</div></div></section>';
}
export function ctaBand(h, p) {
  return '<section class="bxcta"><div class="bxw"><div class="bxcta-in"><div>' +
    `<h2 id="get-a-quote">${h || 'Get a free site walk'}${dot}</h2><p>${p || 'We walk your site, count the stations and time each common area. You get a written quote within one business day.'}</p></div>` +
    ctaButtons() + '</div></div></section>';
}
// expand the shared markers in a body
export function expand(html, ctx) {
  return html
    .replace(/<!--SERVICES(?::(\w+))?-->/g, (m, skip) => servicesBlock(skip))
    .replace(/<!--AREAS(?::(\w+))?-->/g, (m, focus) => areasBlock(ctx.comMap, focus))
    .replace(/<!--INCLUDES-->/g, () => includesBlock())
    .replace(/<!--STEPS-->/g, () => stepsBlock())
    .replace(/<!--ASK-->/g, () => askBlock())
    .replace(/<!--RULES(?::([^>]+?))?-->/g, (m, only) => rulesBlock(only))
    .replace(/<!--TOWNS(?::(\w+))?-->/g, (m, focus) => townsStrip(focus))
    .replace(/<!--RELATED(?::(\w*))?(?::(\w+))?-->/g, (m, skip, focus) => relatedBlock(skip, focus))
    .replace(/@@(\w+)@@/g, (m, k) => ICONS[k] || m);
}
export function bizInner(pg, trail, ctx) {
  const body = expand(pg.html, ctx);
  const secs = body.match(/<section class="bxs( bxalt)?"/g) || [];
  const lastAlt = secs.length ? /bxalt/.test(secs[secs.length - 1]) : true;
  return hero(pg, trail) + quick(pg.facts) + body + faqBlock(pg.faq, pg.faqTitle, !lastAlt) + ctaBand(pg.ctaH, pg.ctaP);
}

const RAW_CSS = `.apw .doc.bxdoc{max-width:none;margin:0;padding:0;background:var(--bg)}
.apw .doc.bxdoc>*{max-width:none}
.apw a.btn{text-decoration:none}.apw .doc a.btn-dot{color:var(--accent-ink)}.apw .doc a.btn-line-n{color:#FFFFFF}
.apw .bxdoc a{text-decoration-color:var(--accent)}
.apw .bxw{max-width:1280px;margin:0 auto;padding:0 20px}
.apw .bxs{padding:76px 0 0}
.apw .bxdoc h2{margin:0;max-width:16em;font-family:var(--f-head);font-stretch:68%;font-weight:850;font-size:clamp(40px,11vw,50px);letter-spacing:-.006em;line-height:.96;color:var(--ink);text-wrap:balance}
.apw .bxdoc h3{margin:0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:22px;line-height:1.2;color:var(--ink)}
.apw .bxdoc .bxl{margin:16px 0 0;max-width:740px;font-size:18px;line-height:1.6;color:var(--ink2)}
.apw .bxdoc .bxnote{margin:18px 0 0;max-width:760px;font-size:15px;line-height:1.55;color:var(--mute)}
.apw .bxdoc .bxtwo{display:grid;gap:36px}
.apw .bxdoc .bxprose{max-width:760px}.apw .bxdoc .bxprose h3{margin-top:26px}
.apw .bxdoc .bxlist{margin:16px 0 0;padding-left:24px}
.apw .bxsvg{width:28px;height:28px;display:block}.apw .bxbi{width:20px;height:20px;flex:0 0 20px}.apw .bxck{width:28px;height:28px;display:block}
.apw .bxh{background:var(--bg);color:var(--ink)}
.apw .bxh-in{display:grid;gap:40px;padding:28px 0 44px}
.apw .bxcr{display:flex;flex-wrap:wrap;gap:4px 8px;margin:0 0 18px;padding:0;list-style:none;font-size:15px;line-height:1.4;color:var(--mute)}
.apw .bxcr li{margin:0;font-size:15px;color:var(--mute)}.apw .bxcr li+li::before{content:"›";margin-right:8px;color:var(--mute)}
.apw .bxdoc .bxcr a{color:var(--ink2);font-weight:700;text-decoration:none}.apw .bxdoc .bxcr a:hover{text-decoration:underline}
.apw .bxh h1{margin:0;font-family:var(--f-head);font-stretch:68%;font-weight:850;font-size:clamp(46px,14vw,64px);letter-spacing:-.006em;line-height:.92;color:var(--ink);text-wrap:balance}
.apw .bxdoc .bxh .lead{margin:22px 0 0;max-width:620px;font-size:19px;line-height:1.55;color:var(--ink2)}
.apw .bxh-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.apw .bxh-cta .btn{min-height:56px;padding:0 22px;font-size:19px}
.apw .bxdoc .bxtrust{margin:14px 0 0;font-size:15px;line-height:1.45;color:var(--mute)}
.apw .bxdoc .bxbadges{display:flex;flex-wrap:wrap;gap:16px 28px;margin:28px 0 0;padding:24px 0 0;border-top:1px solid var(--line);list-style:none}
.apw .bxdoc .bxbadges li{display:flex;align-items:center;gap:10px;margin:0}
.apw .bxseal{flex:0 0 40px;width:40px;height:40px;display:block}
.apw .bxdoc .bxbadges b{display:block;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:18px;line-height:1.05;color:var(--ink)}
.apw .bxdoc .bxbadges small{display:block;margin-top:3px;font-size:14px;line-height:1.25;color:var(--mute)}
.apw .bxdoc .bxh-stats{display:grid;gap:10px;margin:24px 0 0;padding:0;list-style:none}
.apw .bxdoc .bxh-stats li{margin:0;font-size:16px;line-height:1.45;color:var(--ink2)}
.apw .bxh-stats b{margin-right:8px;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:19px;color:var(--ink)}
.apw .bxh-stats b::after{content:"."}
.apw .bxr{position:relative;margin:0 6px;padding:20px 18px 16px;background:#F6F4EF;color:#0E1430;box-shadow:0 24px 44px -20px rgba(0,0,0,.7);transform:rotate(1.2deg)}
.apw .bxr-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-bottom:12px;border-bottom:2px solid #0E1430}
.apw .bxr-live{font-family:var(--f-head);font-stretch:74%;font-weight:850;font-size:30px;line-height:1;color:#0E1430}
.apw .bxr-live i{display:none}
.apw .bxr-tag{font-size:14px;font-weight:700;color:#B02A08}
.apw .bxdoc .bxr-site{margin:14px 0 0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:20px;line-height:1.2;color:#0E1430}
.apw .bxdoc .bxr-time{margin:4px 0 0;font-size:15px;color:#3E4668}
.apw .bxr-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.apw .bxr-ph{position:relative;display:block;overflow:hidden;aspect-ratio:4/3;background:#D9CDB8}
.apw .bxr-ph svg{display:block;width:100%;height:100%}
.apw .bxr-ph i{position:absolute;left:0;bottom:0;padding:3px 7px;background:#0E1430;font-style:normal;font-size:12px;font-weight:700;color:#F6F4EF}
.apw .bxdoc .bxr-list{margin:14px 0 0;padding:0;list-style:none}
.apw .bxdoc .bxr-list li{display:flex;align-items:center;gap:10px;margin:0;padding:10px 0;border-top:1px solid rgba(14,20,48,.2);font-size:16px;line-height:1.3;color:#0E1430}
.apw .bxr-list b{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.apw .bxr-ok,.apw .bxr-warn{display:grid;place-items:center;flex:0 0 22px;width:22px;height:22px;border-radius:50%;font-size:13px;font-weight:800;color:#F6F4EF}
.apw .bxr-ok{background:#1E7A52}.apw .bxr-warn{background:#B02A08}
.apw .bxr-foot{margin:8px 0 0;padding-top:10px;border-top:2px solid #0E1430;font-size:14px;line-height:1.4;color:#3E4668}
.apw .bxq{margin-top:20px;padding:0}
.apw .bxdoc .bxq-h{max-width:none;font-family:var(--f-head);font-stretch:74%;font-weight:850;font-size:30px;line-height:1;color:var(--ink)}
.apw .bxq-dl{display:grid;gap:0 40px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:18px 0 0;border-top:1px solid var(--line)}
.apw .bxq-dl>div{padding:16px 0 18px;border-bottom:1px solid var(--line)}
.apw .bxq-dl dt{font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:19px;color:var(--ink)}.apw .bxq-dl dd{margin:6px 0 0;font-size:16px;line-height:1.5;color:var(--ink2)}
.apw .bxdoc .bxq-dl dd a{font-weight:700}
.apw .bxcards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));margin-top:30px}
.apw .bxdoc a.bxcard{display:flex;flex-direction:column;padding:22px;border-radius:12px;border:2px solid var(--line2);color:var(--ink);font-weight:400;text-decoration:none}
.apw .bxdoc a.bxcard:hover,.apw .bxdoc a.bxcard:focus-visible{border-color:var(--accent)}
.apw .bxi{display:block;color:var(--accent)}
.apw .bxcard h3{margin-top:16px}.apw .bxdoc .bxcard p{margin:8px 0 0;font-size:16px;line-height:1.55;color:var(--ink2)}
.apw .bxgo{margin-top:auto;padding-top:14px;font-size:16px;font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-decoration-color:var(--accent)}
.apw .bxareas{display:grid;gap:20px;margin-top:30px}
.apw .bxmap{position:relative;margin:0;overflow:hidden;border-radius:6px;background:#141D3D}
.apw .bxmap svg{display:block;width:100%;height:auto;aspect-ratio:384/316}
.apw .bxdoc .bxmap-key{display:flex;align-items:center;gap:10px;margin:0;padding:12px 16px;background:#070B1B;font-size:15px;line-height:1.4;color:var(--ink2)}
.apw .bxmap-key i{flex:0 0 26px;height:0;border-top:3px solid #FF4A1C}
.apw .bxtowns{display:grid;gap:10px}
.apw .bxdoc a.bxtown{display:flex;flex-direction:column;gap:6px;padding:18px 20px;border-radius:12px;border:2px solid var(--line2);color:var(--ink);font-weight:400;text-decoration:none}
.apw .bxdoc a.bxtown:hover,.apw .bxdoc a.bxtown:focus-visible,.apw .bxdoc a.bxtown.on{border-color:var(--accent)}
.apw .bxtown-n{font-family:var(--f-head);font-stretch:74%;font-weight:850;font-size:30px;line-height:1}
.apw .bxzips{display:flex;flex-wrap:wrap;gap:4px 12px}.apw .bxzips i{font-style:normal;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--accent-text)}
.apw .bxtown-p{font-size:16px;line-height:1.5;color:var(--ink2)}
.apw .bxtown .bxgo{padding-top:4px}
.apw .bxdoc .bxcheck{display:grid;gap:0 56px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));margin:30px 0 0;padding:0;list-style:none;border-top:1px solid var(--line)}
.apw .bxdoc .bxcheck li{display:flex;gap:14px;margin:0;padding:16px 0 18px;border-bottom:1px solid var(--line)}
.apw .bxcheck .bxck{flex:0 0 28px;color:var(--accent);stroke-width:3}
.apw .bxcheck b{display:block;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:21px;line-height:1.15;color:var(--ink)}.apw .bxcheck span{display:block;margin-top:4px;font-size:16px;line-height:1.5;color:var(--ink2)}
.apw .bxdoc .bxsteps{display:grid;gap:0 40px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));margin:30px 0 0;padding:0;list-style:none;border-top:1px solid var(--line)}
.apw .bxdoc .bxsteps li{position:relative;margin:0;padding:20px 0 24px;border-bottom:1px solid var(--line)}
.apw .bxn{display:block;font-family:var(--f-head);font-stretch:66%;font-weight:900;font-size:62px;line-height:.9;color:var(--accent)}
.apw .bxsteps h3{margin-top:12px}.apw .bxdoc .bxsteps p{margin:6px 0 0;font-size:16px;line-height:1.5}
.apw .bxtable-wrap{margin-top:28px;border-top:1px solid var(--line)}
.apw .bxdoc .bxtable{width:100%;border-collapse:collapse;font-size:17px}
.apw .bxdoc .bxtable th,.apw .bxdoc .bxtable td{padding:14px 18px 14px 0;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;line-height:1.45;color:var(--ink2)}
.apw .bxdoc .bxtable thead th{font-size:14px;font-weight:700;color:var(--mute)}
.apw .bxdoc .bxtable tbody th{font-weight:700;color:var(--ink)}
.apw .bxtable .num{font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:19px;color:var(--ink);white-space:nowrap}
.apw .bxfactors{display:grid;gap:0 40px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:28px;border-top:1px solid var(--line)}
.apw .bxfactor{padding:20px 0 22px;border-bottom:1px solid var(--line)}
.apw .bxfactor h3{margin-top:12px;font-size:21px}.apw .bxdoc .bxfactor p{margin:6px 0 0;font-size:16px;line-height:1.5}
.apw .bxrules{display:grid;gap:0 40px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-top:28px}.apw .bxrules.bxplaces{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.apw .bxrule{padding:18px 0 22px;border-top:3px solid var(--accent)}
.apw .bxdoc .bxrule-t{margin:0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:21px;line-height:1.2;color:var(--ink)}.apw .bxdoc .bxrule p{font-size:16px;line-height:1.55}
.apw .bxdoc .bxchips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0;list-style:none}
.apw .bxdoc .bxchips li{margin:0}
.apw .bxdoc .bxchips a{display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:0 16px;border-radius:12px;border:2px solid var(--line2);color:var(--ink);font-family:var(--f-head);font-stretch:88%;font-size:18px;font-weight:750;text-decoration:none}
.apw .bxdoc .bxchips a:hover,.apw .bxdoc .bxchips a[aria-current]{border-color:var(--accent)}
.apw .bxchips span{font-family:var(--f-text);font-size:14px;font-weight:400;color:var(--mute)}
.apw .bxrel{display:grid;gap:26px;margin-top:28px}.apw .bxdoc .bxrel-t{margin:0;font-size:15px;font-weight:700;color:var(--mute)}
.apw .bxfaq{margin-top:28px;border-top:1px solid var(--line)}
.apw .bxfaq details{border-bottom:1px solid var(--line)}
.apw .bxfaq summary{display:flex;align-items:center;gap:16px;min-height:64px;padding:14px 0;cursor:pointer;list-style:none}
.apw .bxfaq summary::-webkit-details-marker{display:none}
.apw .bxfaq summary h3{flex:1;font-size:20px}
.apw .bxpm{position:relative;flex:0 0 22px;width:22px;height:22px}
.apw .bxpm::before,.apw .bxpm::after{content:"";position:absolute;left:2px;right:2px;top:10px;height:2.5px;border-radius:2px;background:var(--accent)}
.apw .bxpm::after{transform:rotate(90deg);transition:transform .18s ease}.apw .bxfaq details[open] .bxpm::after{transform:none}
.apw .bxdoc .bxfaq details p{margin:0;max-width:760px;padding:0 38px 20px 0;font-size:17px;line-height:1.6}
.apw .bxcta{margin-top:84px;padding:64px 0;background:var(--accent);color:#0E1430}
.apw .bxcta-in{display:grid;gap:8px}
.apw .bxdoc .bxcta h2{max-width:none;font-stretch:66%;font-weight:900;font-size:clamp(52px,15vw,84px);line-height:.88;color:#0E1430}.apw .bxdoc .bxcta p{max-width:620px;margin:16px 0 0;font-size:18px;font-weight:500;color:#0E1430}
.apw .bxdoc .bxcta .btn-dot{background:#0E1430;color:#F6F4EF}
.apw .bxdoc .bxcta .btn-dot:hover{background:#1B2449;color:#FFFFFF}
.apw .bxdoc .bxcta .btn-line-n{color:#0E1430;border-color:#0E1430}
.apw .bxcta a:focus-visible{outline-color:#0E1430}
.apw .bxhook{display:grid;gap:0 40px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:28px;border-top:1px solid var(--line)}
.apw .bxhook>div{padding:20px 0 22px;border-bottom:1px solid var(--line)}
.apw .bxhook h3{margin-top:12px;font-size:21px}.apw .bxdoc .bxhook p{margin:6px 0 0;font-size:16px;line-height:1.55}
.apw .bxtowns.bxtowns-g{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));margin-top:30px}.apw .bxtown-h{font-size:15px;line-height:1.5;color:var(--mute)}
.apw .bxdoc .bxsoon{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 20px;margin:20px 0 0;padding:0;list-style:none}.apw .bxdoc .bxsoon li{margin:0;font-size:17px;font-weight:700;color:var(--ink)}
.apw .bxzipt td:first-child{font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink)}
@media (max-width:640px){.apw .bxh-cta .btn{flex:1 1 auto}.apw .bxh-cta .btn-dot{flex-basis:100%}
.apw .bxtable thead{display:none}.apw .bxtable tr{display:block;padding:14px 0;border-bottom:1px solid var(--line)}
.apw .bxdoc .bxtable th,.apw .bxdoc .bxtable td{display:block;padding:0;border:0}.apw .bxdoc .bxtable td{margin-top:4px}.apw .bxtable td[data-label]::before{content:attr(data-label) " ";font-weight:700;color:var(--ink)}}
@media (min-width:1024px){.apw .bxw{padding:0 40px}.apw .bxs{padding:128px 0 0}
.apw .bxh-in{grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);align-items:center;gap:72px;padding:56px 0 72px}
.apw .bxh h1{font-size:clamp(76px,7.3vw,106px)}.apw .bxdoc h2{font-size:clamp(56px,5.2vw,74px)}.apw .bxdoc .bxh .lead{font-size:20px}
.apw .bxr{margin:0}
.apw .bxareas{grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);align-items:start;gap:32px}
.apw .bxtwo{grid-template-columns:repeat(2,minmax(0,1fr));gap:72px}.apw .bxrel{grid-template-columns:repeat(2,minmax(0,1fr))}
.apw .bxcta{margin-top:140px;padding:96px 0}.apw .bxcta-in{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:48px}.apw .bxcta .bxh-cta{margin-top:0}.apw .bxdoc .bxcta h2{font-size:clamp(96px,9.4vw,140px)}}
@media (prefers-reduced-motion:reduce){.apw .bxpm::after{transition:none}}`;
export const BIZ_CSS = RAW_CSS.replace(/\.apw \.bxdoc /g, '.apw .doc.bxdoc ').replace(/\.apw \.(?!doc)/g, '.apw .doc.bxdoc .');

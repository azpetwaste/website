# Adding a town (or a whole new area)

Joe's plan (Nov 15, 2026): the West Valley first, then Phoenix, the East Valley, Tucson, Flagstaff, Kingman and Boulder City. The site is built so a town is data, not a redesign. This is the list of places a new town has to be added. Do them all in one change, then run every check.

## What already scales
- Page addresses: `/pooper-scooper/<town>-az/`, and `/pooper-scooper/<town>-az/<neighborhood>/` for a big neighborhood like Verrado. A Nevada town would be `/pooper-scooper/boulder-city-nv/`.
- Town pages come from one template (`design/generator/city.tpl.html`). The copy for each town is in `design/generator/cities.py` and `design/generator/longform.py`.
- Sign up, the office and the week planner work by ZIP code. A ZIP that is not on the list goes to the waitlist on its own.

## The list for one new town
1. `design/generator/cities.py`: the town entry (name, ZIP line, intro, what makes it different). Give it a page name like `CityWaddell.dc.html`, add that name to `LINKS` in `export_site.py` with the real address, and add the town to the `nearby` list of every other town.
2. `design/generator/longform.py` `TOWNS`: neighborhoods, local answers and the town FAQ. Real places only. Check each one on a map. Write the town on its own. Do not copy another town and swap the name.
3. `research/neighborhoods.json`: the neighborhood names by ZIP. Save where each fact on the page came from in `research/<town>-sources.md` (see `research/waddell-sources.md`).
4. `build/build.mjs`: `PLACES`, `ALL_ZIPS`, `SIX` (the names we serve, in the order of our Google profile, used for the schema and every "we serve" sentence) and `TOWNS` (address, title, description). Title 62 letters or less, description 110 to 165. Add the town to the Google profile's service area the same day. In the same file: the card text on Areas we serve (`blurbs`), the 404 list and the short links in `_redirects` (`/waddell` and the like). No redirect may start at the new page's own address.
5. `src/worker/worker.js` `ZIPS`: the ZIP codes, the city and the area key. Without this, sign up says "We do not scoop in that ZIP code yet."
6. `design/generator/parts.py`: `DD_AREAS` (the Areas we serve menu), `_MNAV` (the phone menu), the footer town links, `MAP_CHIPS`, the ZIP to area lookup and the map pins.
7. The map: `research/service_area.geojson`, then `design/generator/mapgen.py`, `truemap.py`, `valleymap.py` and `mapdata.json`. Each town page lights its own shape, so a new town needs one: add it to `truemap.build`, to `AREA_METHODS` in `parts.py` (`pin`, `blob` and the ZIP lookup), and to `static_map` in `export_site.py` (the count of shapes, and the `RES` and `COM` links). Today there are six: four ZIP areas (Buckeye, Goodyear, Litchfield Park, Waddell) and two places drawn on top (Verrado, Citrus Park). A town far from the West Valley (Tucson, Flagstaff, Kingman) needs its own map picture. Do not stretch the West Valley map.
8. The sign up form city list: `design/generator/booking.tpl.html` and `book.prod.tpl.html`. If the form changes, retake the opt in screenshots for `/texts/` (`build/optin-shots.py`).
9. `content/site/commercial-pet-waste-removal/<town>-az.html` if we take commercial work there.
10. `llms.txt` (in `build/build.mjs`) and the footer town links.
11. The office: the scooper and the days for that part of town in `/crew`, Schedule, Plan the week. The planner cuts days at long hops between towns, so a far town gets its own day.
12. Take the town off "Coming soon" (`parts.py`) if it was listed there.

## A worked example: Waddell (Nov 16, 2026)
Waddell was a name that shared the Citrus Park page. It got its own page in one change. The commit "Waddell has its own town page" shows every file a town touches.
What that change also had to do, because the name was already in use: move the Waddell neighborhoods and questions off the Citrus Park page so the two pages do not say the same thing, give Citrus Park its own map shape, and point every Waddell link at the new page.

## When we leave the West Valley
These say "West Valley" today and need a second look the day the first town outside it goes live:
- The home page H1 and title, the Areas we serve page, and the footer.
- Titles that end in "West Valley AZ" on the service pages (pricing, one time cleanup, same day, commercial).
- The schema `areaServed` list and the business description in `build/build.mjs`.
- The plan: keep the home page for the whole company, and give each area its own hub page (`/pooper-scooper/` lists areas, each area lists its towns). Each area needs its own Google Business Profile only if there is a real staffed place there. Google does not allow a profile for a town we only drive to.
- Boulder City is in Nevada. The name "Arizona Pet Waste" and every "AZ" on the site would be wrong there. That town needs a call from Joe before any page is written.

## Checks
```
cd design/generator && APW_BOARDS=../../src/boards/ python3 export_site.py && python3 readgrade.py
cd ../.. && npm run build && npm run check && node build/worker.test.mjs && node build/week.test.mjs
```
Town copy should read at about grade 3 (`readgrade.py` prints the grade and the hardest sentences).

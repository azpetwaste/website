"""Copy for the town pages, written at a 7th grade reading level. Sources are in the canvas notes.
We serve every ZIP code in each town: Buckeye 85326 and 85396, Goodyear 85338 and 85395, Litchfield Park 85340,
Waddell (Citrus Park) 85355. Verrado has its own page inside Buckeye."""
from parts import faq


def why(items):
    return '\n  '.join('<p class="cp"><strong style="color: var(--ink);">%s</strong> %s</p>' % (a, b) for a, b in items)


def nearby(links, extra):
    out = ''.join('<a href="%s" class="btn btn-line-n" style="justify-content: space-between; padding: 0 20px;">%s<span aria-hidden="true">›</span></a>' % (h, n) for h, n in links)
    return out + '<p style="margin: 6px 0 0; font-size: 15px; line-height: 1.55; color: #AEB5D8;">%s</p>' % extra


INTRO = 'Arizona Pet Waste picks up dog poop in %s every week. We text you the night before, let you watch our truck on a live map, and send you a photo of your latched gate when we leave.'

B = ('CityBuckeye.dc.html', 'Buckeye')
V = ('CityVerrado.dc.html', 'Verrado')
L = ('CityLitchfieldPark.dc.html', 'Litchfield Park')
C = ('CityCitrusPark.dc.html', 'Citrus Park')
G = ('CityGoodyear.dc.html', 'Goodyear')
ALL = ('AreasWeServe.dc.html', 'Every area we serve')

HEAT = ('Heat and flies.', 'Phoenix has a normal July high of about 106 degrees. Heat makes poop smell stronger, and University of Arizona experts say flies breed in pet waste. Weekly pickup stops the smell before it starts.')
SOIL = ('Germs stay in the soil.', 'The CDC says roundworm eggs from dog poop can live in soil for months or even years. Its advice is to pick up dog poop, even in your own yard, and most of all where kids play.')
STORMS = ('Monsoon storms spread it.', 'From mid June through September, heavy rain can wash poop into the street. Maricopa County says storm drain water goes to rivers and lakes without being treated.')
CONTRACT = ('Is there a contract?', 'No. You pay month to month and can cancel any time in My Yard. Your first month is free on any plan.')
TURF = ('Do you clean turf and rock yards?', 'Yes. We pick up every pile on turf, grass and rock. We rake rock and gravel with a wide metal rake, then spray sanitizer and deodorizer where your dogs go most. The spray is free.')
HOME = ('Do I need to be home?', 'No. Most of our customers are at work. Add your gate code in My Yard, and we send a photo of your latched gate when we leave.')

CITIES = [
    dict(
        file=B[0], id='k', area='buckeye', name='Buckeye', eyebrow='Buckeye, AZ · ZIP 85326 and 85396', h='6400',
        intro=INTRO % 'Buckeye',
        map_h2='Buckeye ZIP codes we serve',
        where='Buckeye has two ZIP codes, and we scoop every home in both. 85396 is north Buckeye, near the White Tank Mountains, with Verrado, Tartesso and Festival Ranch. 85326 is the rest of Buckeye, from Sundance and Westpark to historic downtown.',
        why_h2='Why Buckeye yards need weekly pickup',
        why=why([
            ('A big city that keeps growing.', 'Buckeye covers about 393 square miles, more than any Arizona city but Phoenix, and the Census Bureau has named it one of the fastest growing cities in the country. New homes bring new yards, from turf to rock to grass.'),
            HEAT,
            STORMS,
            SOIL,
        ]),
        faq_h2='Buckeye questions',
        faq=faq([
            ('Do you serve all of Buckeye?', 'Yes. We scoop every home in both Buckeye ZIP codes, 85326 and 85396. That includes Verrado, Sundance, Westpark, Tartesso, Festival Ranch and historic downtown.'),
            TURF,
            HOME,
            ('What day do you come to Buckeye?', 'We scoop Buckeye on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([V, G, L, C, ALL], 'Not sure about your street? Type your ZIP when you book, and we will tell you right away.'),
    ),
    dict(
        file=G[0], id='g', area='goodyear', name='Goodyear', eyebrow='Goodyear, AZ · ZIP 85338 and 85395', h='6300',
        intro=INTRO % 'Goodyear',
        map_h2='Goodyear ZIP codes we serve',
        where='Goodyear has two ZIP codes, and we scoop every home in both. 85395 is north of Interstate 10, with Palm Valley, PebbleCreek and Sedella. 85338 runs south of the freeway to Estrella Mountain Ranch, with Canyon Trails, Centerra and Cottonflower on the way.',
        why_h2='Why Goodyear yards need weekly pickup',
        why=why([
            ('Goodyear has a twice a week rule.', 'Goodyear’s city code says animal droppings must be cleaned out of yards at least twice a week. Our twice a week plan matches that rule.'),
            ('Storms carry it away.', 'Goodyear’s storm drains flow to the Gila and Agua Fria rivers. During monsoon season, from mid June through September, rain can wash yard poop into those drains.'),
            ('Turf gets hot.', 'Artificial turf can get hotter than 150 degrees in the sun, so poop starts to smell fast. Our free sanitizer spray helps.'),
            SOIL,
        ]),
        faq_h2='Goodyear questions',
        faq=faq([
            ('Do you serve all of Goodyear?', 'Yes. We scoop every home in both Goodyear ZIP codes, 85338 and 85395. That includes Estrella Mountain Ranch, Canyon Trails, Centerra, Palm Valley and PebbleCreek.'),
            ('Does Goodyear really require pickup twice a week?', 'Goodyear city code says manure and droppings must be removed at least twice a week. To match that, pick our twice a week plan. It is $189 a month for 1 or 2 dogs.'),
            ('Do you clean turf?', 'Yes. We pick up every pile on turf and spray sanitizer and deodorizer on the spots your dogs use most. The spray is free. For a deep clean, add a turf odor treatment for $35.'),
            ('What day do you come to Goodyear?', 'We scoop Goodyear on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([L, B, C, V, ALL], 'Live in Avondale? Join the waitlist when you book.'),
    ),
    dict(
        file=L[0], id='l', area='litchfield', name='Litchfield Park', eyebrow='Litchfield Park, AZ · ZIP 85340', h='6380',
        intro=INTRO % 'Litchfield Park',
        map_h2='Litchfield Park ZIP code we serve',
        where='Litchfield Park is north of Interstate 10 at the Litchfield Road exit, with Goodyear to the west and south and Luke Air Force Base to the north. It has one ZIP code, 85340, and we scoop every home in it.',
        why_h2='Why Litchfield Park yards need weekly pickup',
        why=why([
            ('Big yards, lots of shade.', 'Litchfield Park started in 1916 as a cotton farm for Goodyear Tire. Along Old Litchfield Road, homes sit on deep lots with palms and citrus trees. Dogs love shady spots, and poop under trees is easy to miss.'),
            ('The city has rules.', 'Litchfield Park city code says dog owners must pick up poop right away in parks, on public property, and on other people’s property. Leashes in parks can be no longer than six feet.'),
            HEAT,
            SOIL,
        ]),
        faq_h2='Litchfield Park questions',
        faq=faq([
            ('Do you serve all of Litchfield Park?', 'Yes. We scoop every home in ZIP 85340, the ZIP code for Litchfield Park. We also scoop every ZIP code in Goodyear and Buckeye.'),
            CONTRACT,
            ('Is my dog safe when you come?', 'Yes. We shut the gate behind us. When we leave, we latch it, pull on it, and send you a photo. If a dog in the yard is not safe to be near, we do not go in. We text you instead.'),
            ('What day do you come to Litchfield Park?', 'We scoop Litchfield Park on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([G, B, C, V, ALL], 'Live in Avondale? Join the waitlist when you book.'),
    ),
    dict(
        file=C[0], id='c', area='citrus', name='Citrus Park', eyebrow='Citrus Park · Waddell, AZ · ZIP 85355', h='6340',
        intro=INTRO % 'Citrus Park',
        map_h2='Citrus Park ZIP code we serve',
        where='Citrus Park sits between Perryville Road and Cotton Lane, from Northern Avenue south to about Camelback Road. It is not part of any city, and its mail comes through the Waddell post office, ZIP 85355. We scoop every home in 85355 and the homes next to it, like Zanjero Trails.',
        why_h2='Why Citrus Park yards need weekly pickup',
        why=why([
            ('Big lots and green grass.', 'Many Citrus Park homes sit on an acre or more with flood irrigation, so the grass stays green. Thick grass hides poop, and dogs have lots of room to roam. That makes piles easy to miss.'),
            STORMS,
            HEAT,
            SOIL,
        ]),
        faq_h2='Citrus Park questions',
        faq=faq([
            ('Do you serve all of Citrus Park?', 'Yes. We scoop all of Citrus Park and every home in Waddell ZIP 85355. We also scoop the homes next to it, like Zanjero Trails.'),
            ('Do you clean big grass yards?', 'Yes. We walk your yard in rows and pick up every pile. Then we spray sanitizer and deodorizer where your dogs go most. The spray is free.'),
            CONTRACT,
            ('What day do you come to Citrus Park?', 'We scoop Citrus Park on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([L, G, B, V, ALL], 'Live in Surprise? Join the waitlist when you book.'),
    ),
    dict(
        file=V[0], id='v', area='verrado', name='Verrado', eyebrow='Verrado · Buckeye, AZ · ZIP 85396', h='6180',
        intro=INTRO % 'Verrado',
        map_h2='Verrado ZIP code we serve',
        where='Verrado sits north of Interstate 10 at the Verrado Way exit, right at the base of the White Tank Mountains. It is in Buckeye ZIP 85396, and we scoop every home in it. We also scoop the rest of Buckeye, ZIP 85326.',
        why_h2='Why Verrado yards need weekly pickup',
        why=why([
            ('Verrado is made for dogs.', 'The community has more than 86 neighborhood parks, over 26 miles of trails, and Granite Bluff Dog Park off Verrado Way. Active dogs mean a busy yard.'),
            ('The heat makes it worse.', 'Phoenix has a normal July high of about 106 degrees, and artificial turf can get hotter than 150 degrees. Hot poop smells stronger and draws flies. University of Arizona experts say flies breed in pet waste.'),
            ('It is a health issue.', 'The CDC says dog poop can carry germs like Salmonella, Giardia, roundworm and hookworm. Roundworm eggs can live in soil for months or even years, so the CDC says to pick up poop even in your own yard.'),
            STORMS,
        ]),
        faq_h2='Verrado questions',
        faq=faq([
            ('Do you serve all of Verrado?', 'Yes. We scoop every Verrado home, and all of Buckeye too, in ZIP codes 85396 and 85326. Not sure? Type your ZIP when you book, and we will tell you right away.'),
            TURF,
            HOME,
            ('What day do you come to Verrado?', 'We scoop Verrado on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([B, G, L, C, ALL], 'Sundance, Tartesso and Festival Ranch are on our Buckeye page.'),
    ),
]

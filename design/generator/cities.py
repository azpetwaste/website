"""Copy for the four location pages, written at a 7th grade reading level. Sources are in the canvas notes."""
from parts import faq


def why(items):
    return '\n  '.join('<p class="cp"><strong style="color: var(--ink);">%s</strong> %s</p>' % (a, b) for a, b in items)


def nearby(links, extra):
    out = ''.join('<a href="%s" class="btn btn-line-n" style="justify-content: space-between; padding: 0 20px;">%s<span aria-hidden="true">›</span></a>' % (h, n) for h, n in links)
    return out + '<p style="margin: 6px 0 0; font-size: 15px; line-height: 1.55; color: #AEB5D8;">%s</p>' % extra


INTRO = 'Arizona Pet Waste picks up dog poop in %s every week. We text you the night before, let you watch our truck on a live map, and send you a photo of your latched gate when we leave.'

V = ('CityVerrado.dc.html', 'Verrado')
L = ('CityLitchfieldPark.dc.html', 'Litchfield Park')
C = ('CityCitrusPark.dc.html', 'Citrus Park')
G = ('CityGoodyear.dc.html', 'Goodyear')

HEAT = ('Heat and flies.', 'Phoenix has a normal July high of about 106 degrees. Heat makes poop smell stronger, and University of Arizona experts say flies breed in pet waste. Weekly pickup stops the smell before it starts.')
SOIL = ('Germs stay in the soil.', 'The CDC says roundworm eggs from dog poop can live in soil for months or even years. Its advice is to pick up dog poop, even in your own yard, and most of all where kids play.')
CONTRACT = ('Is there a contract?', 'No. You pay month to month and can cancel any time in My Yard. Your first month is free on any plan.')

CITIES = [
    dict(
        file=V[0], id='v', area='verrado', name='Verrado', eyebrow='Verrado · Buckeye, AZ 85396', h='6180',
        intro=INTRO % 'Verrado',
        map_h2='Where we scoop in Verrado',
        where='Verrado sits north of Interstate 10 at the Verrado Way exit, right at the base of the White Tank Mountains. We scoop Verrado homes in ZIP 85396.',
        why_h2='Why Verrado yards need weekly pickup',
        why=why([
            ('Verrado is made for dogs.', 'The community has more than 86 neighborhood parks, over 26 miles of trails, and Granite Bluff Dog Park off Verrado Way. Active dogs mean a busy yard.'),
            ('The heat makes it worse.', 'Phoenix has a normal July high of about 106 degrees, and artificial turf can get hotter than 150 degrees. Hot poop smells stronger and draws flies. University of Arizona experts say flies breed in pet waste.'),
            ('It is a health issue.', 'The CDC says dog poop can carry germs like Salmonella, Giardia, roundworm and hookworm. Roundworm eggs can live in soil for months or even years, so the CDC says to pick up poop even in your own yard.'),
            ('Monsoon storms spread it.', 'From mid June through September, heavy rain can wash poop into the street. Maricopa County says storm drain water goes to rivers and lakes without being treated.'),
        ]),
        faq_h2='Verrado questions',
        faq=faq([
            ('Do you serve all of Verrado?', 'Yes. We scoop Verrado homes in ZIP 85396, plus the homes east of Verrado up to Perryville Road. Not sure? Type your ZIP when you book, and we will tell you right away.'),
            ('Do you clean turf and rock yards?', 'Yes. We pick up every pile on turf, grass and rock. We rake rock and gravel with a wide metal rake, then spray sanitizer and deodorizer where your dogs go most. The spray is free.'),
            ('Do I need to be home?', 'No. Most of our customers are at work. Add your gate code in My Yard, and we send a photo of your latched gate when we leave.'),
            ('What day do you come to Verrado?', 'We scoop Verrado on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([C, G, L], 'Live in Sundance, Tartesso or Festival Ranch? Join the waitlist when you book.'),
    ),
    dict(
        file=C[0], id='c', area='citrus', name='Citrus Park', eyebrow='Citrus Park · Waddell, AZ 85355', h='6340',
        intro=INTRO % 'Citrus Park',
        map_h2='Where we scoop in Citrus Park',
        where='Citrus Park sits between Perryville Road and Cotton Lane, from Northern Avenue south to about Camelback Road. About 5,200 people live there. It is not part of any city, and its mail comes through the Waddell post office. We scoop all of Citrus Park and the homes next to it, like Zanjero Trails.',
        why_h2='Why Citrus Park yards need weekly pickup',
        why=why([
            ('Big lots and green grass.', 'Many Citrus Park homes sit on an acre or more with flood irrigation, so the grass stays green. Thick grass hides poop, and dogs have lots of room to roam. That makes piles easy to miss.'),
            ('Monsoon storms spread it.', 'From mid June through September, heavy rain can wash poop into the street. Maricopa County says storm drain water goes to rivers and lakes without being treated.'),
            HEAT,
            SOIL,
        ]),
        faq_h2='Citrus Park questions',
        faq=faq([
            ('Do you serve all of Citrus Park?', 'Yes. We scoop all of Citrus Park, from Perryville Road to Cotton Lane. We also scoop the homes next to it, like Zanjero Trails.'),
            ('Do you clean big grass yards?', 'Yes. We walk your yard in rows and pick up every pile. Then we spray sanitizer and deodorizer where your dogs go most. The spray is free.'),
            CONTRACT,
            ('What day do you come to Citrus Park?', 'We scoop Citrus Park on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([V, G, L], 'Live in Waddell north of Northern Avenue? Join the waitlist when you book.'),
    ),
    dict(
        file=G[0], id='g', area='goodyear', name='Goodyear', eyebrow='Goodyear, AZ 85395', h='6120',
        intro=INTRO % 'Goodyear',
        map_h2='Where we scoop in Goodyear',
        where='We scoop Goodyear north of Interstate 10, from Perryville Road east to Dysart Road. That includes Palm Valley and PebbleCreek, ZIP 85395.',
        why_h2='Why Goodyear yards need weekly pickup',
        why=why([
            ('Goodyear has a twice a week rule.', 'Goodyear’s city code says animal droppings must be cleaned out of yards at least twice a week. Our twice a week plan matches that rule.'),
            ('Storms carry it away.', 'Goodyear’s storm drains flow to the Gila and Agua Fria rivers. During monsoon season, from mid June through September, rain can wash yard poop into those drains.'),
            ('Turf gets hot.', 'Artificial turf can get hotter than 150 degrees in the sun, so poop starts to smell fast. Our free sanitizer spray helps.'),
            SOIL,
        ]),
        faq_h2='Goodyear questions',
        faq=faq([
            ('Do you serve all of Goodyear?', 'We scoop Goodyear north of Interstate 10, ZIP 85395. Live south of the freeway? Join the waitlist when you book.'),
            ('Does Goodyear really require pickup twice a week?', 'Goodyear city code says manure and droppings must be removed at least twice a week. To match that, pick our twice a week plan. It is $189 a month for 1 or 2 dogs.'),
            ('Do you clean turf?', 'Yes. We pick up every pile on turf and spray sanitizer and deodorizer on the spots your dogs use most. The spray is free. For a deep clean, add a turf odor treatment for $35.'),
            ('What day do you come to Goodyear?', 'We scoop Goodyear on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([L, C, V], 'Live in Canyon Trails, Estrella or Avondale? Join the waitlist when you book.'),
    ),
    dict(
        file=L[0], id='l', area='litchfield', name='Litchfield Park', eyebrow='Litchfield Park, AZ 85340', h='6380',
        intro=INTRO % 'Litchfield Park',
        map_h2='Where we scoop in Litchfield Park',
        where='Litchfield Park is north of Interstate 10 at the Litchfield Road exit, with Goodyear to the west and south and Luke Air Force Base to the north. We scoop homes in ZIP 85340.',
        why_h2='Why Litchfield Park yards need weekly pickup',
        why=why([
            ('Big yards, lots of shade.', 'Litchfield Park started in 1916 as a cotton farm for Goodyear Tire. Along Old Litchfield Road, homes sit on deep lots with palms and citrus trees. Dogs love shady spots, and poop under trees is easy to miss.'),
            ('The city has rules.', 'Litchfield Park city code says dog owners must pick up poop right away in parks, on public property, and on other people’s property. Leashes in parks can be no longer than six feet.'),
            HEAT,
            SOIL,
        ]),
        faq_h2='Litchfield Park questions',
        faq=faq([
            ('Do you serve all of Litchfield Park?', 'Yes. We scoop homes all over Litchfield Park, ZIP 85340. We also scoop Goodyear north of Interstate 10, like Palm Valley and PebbleCreek.'),
            CONTRACT,
            ('Is my dog safe when you come?', 'Yes. We shut the gate behind us. When we leave, we latch it, pull on it, and send you a photo. If a dog in the yard is not safe to be near, we do not go in. We text you instead.'),
            ('What day do you come to Litchfield Park?', 'We scoop Litchfield Park on [route day]. You get a text the night before with a 30 minute window.'),
        ]),
        nearby=nearby([G, C, V], 'Live in Avondale? Join the waitlist when you book.'),
    ),
]

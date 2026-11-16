"""Copy for the town pages, written short and plain (3rd to 5th grade reading level). Sources are in the canvas notes.
We serve every ZIP code in each town: Buckeye 85326 and 85396, Goodyear 85338 and 85395, Litchfield Park 85340,
Waddell 85355. Verrado has its own page inside Buckeye. Citrus Park is the south part of the Waddell ZIP and has its own page too.
Each town is written on its own: the Waddell page is not the Citrus Park page with the name swapped."""
from parts import faq


def why(items):
    return '\n  '.join('<p class="cp"><strong>%s</strong> %s</p>' % (a, b) for a, b in items)


def nearby(links, extra):
    out = ''.join('<a href="%s" class="btn btn-line">%s<span aria-hidden="true">›</span></a>' % (h, n) for h, n in links)
    return out + '<p class="nb-n">%s</p>' % extra


import longform  # noqa: E402


def faqs(town, local, disposal=None):
    """Local questions first, then the questions every town page answers, then the route day."""
    common = longform.faq_common(town)
    if disposal:
        common = [(q, disposal if q.startswith('Where should I throw away') else a) for q, a in common]
    return faq(local + common + [('What day do you come to %s?' % town, 'We set your day for you. We run set routes, and that keeps our prices down. After you sign up, we reach out to let you know your day and time. '
                                                         'Then you get a text the night before each visit with a 30 minute window.')])


BUCKEYE_TRASH = ('Bag it, tie the bag, and put it in your trash cart. Buckeye wants all trash bagged and tied, '
                 'and dog poop never goes in the recycle cart. On our visits, we bag it and haul it away for you.')

INTRO = 'Arizona Pet Waste picks up dog poop in %s every week and hauls it away. We text you the night before, let you watch our truck on a live map, and send you a photo of your latched gate when we leave.'

B = ('CityBuckeye.dc.html', 'Buckeye')
V = ('CityVerrado.dc.html', 'Verrado')
L = ('CityLitchfieldPark.dc.html', 'Litchfield Park')
C = ('CityCitrusPark.dc.html', 'Citrus Park')
W = ('CityWaddell.dc.html', 'Waddell')
G = ('CityGoodyear.dc.html', 'Goodyear')
ALL = ('AreasWeServe.dc.html', 'Every area we serve')


CITIES = [
    dict(
        file=B[0], id='k', area='buckeye', name='Buckeye', eyebrow='Buckeye, AZ · ZIP 85326 and 85396', h='13000',
        intro=INTRO % 'Buckeye',
        map_h2='We cover all of Buckeye, AZ',
        where='Every home. Every street. Both Buckeye ZIP codes, 85326 and 85396.',
        why_h2='Why Buckeye yards need weekly pickup',
        why=why([
            ('A city that keeps growing.', 'Buckeye covers about 393 square miles, more than any Arizona city but Phoenix. More than 125,000 people live here now, and it keeps growing fast. New homes mean new yards, from turf to rock to grass.'),
            ('Lots of turf and rock.', 'Many Buckeye yards are turf or rock. Poop hides between rocks and smells fast on hot turf. We rake rock yards and spray the spots your dogs use most.'),
            ('HOAs and neighbors.', 'Most Buckeye neighborhoods have an HOA. A clean yard means no smell over the wall and no letters from the HOA.'),
            ('Kids and dogs play there.', 'Your yard is where your kids and dogs play. Weekly pickup keeps it a place you want to be.'),
        ]),
        faq_h2='Buckeye questions',
        faq=faqs('Buckeye', [
            ('Do you serve all of Buckeye?', 'Yes. We scoop every home in both Buckeye ZIP codes, 85326 and 85396. That includes Verrado, Sundance, Tartesso, Festival Ranch, Westpark, Blue Horizons, Teravalis and historic downtown.'),
            ('Do you come out to Sun City Festival?', 'Yes. Sun City Festival and Festival Foothills are in ZIP 85396, so we come to you. The price is the same as anywhere else.'),
            ('Is it illegal to not pick up dog poop in Buckeye?', 'Yes. Buckeye city code says animal poop cannot be left in a way that is not clean, on public land or private land. That includes your own yard. Most HOAs have their own pickup rules too.'),
            ('Can I report my neighbor for dog poop in Buckeye?', 'Yes. You can report it to the City of Buckeye. If you have an HOA, you can tell them too. Talking to your neighbor first often works best. Sometimes they just need a hand, and we can help.'),
        ], BUCKEYE_TRASH),
        nearby=nearby([V, G, L, C, W, ALL], 'Not sure about your street? Type your ZIP when you book, and we will tell you right away.'),
    ),
    dict(
        file=G[0], id='g', area='goodyear', name='Goodyear', eyebrow='Goodyear, AZ · ZIP 85338 and 85395', h='13400',
        intro=INTRO % 'Goodyear',
        map_h2='We cover all of Goodyear, AZ',
        where='Every home. Every street. Both Goodyear ZIP codes, 85338 and 85395.',
        why_h2='Why Goodyear yards need weekly pickup',
        why=why([
            ('Goodyear has a twice a week rule.', 'Goodyear city code says droppings must be cleaned out of yards at least twice a week. Our twice a week plan matches that rule.'),
            ('Storms carry it away.', 'Goodyear storm drains flow to the Gila and Agua Fria rivers, and that water is not cleaned first. A monsoon storm can wash yard poop right into them.'),
            ('Turf gets hot.', 'Turf can get hotter than 150 degrees in the sun, so poop starts to smell fast. Our free deodorizer spray helps.'),
            ('A big, busy city.', 'More than 125,000 people live in Goodyear now, and it added more than 7,000 people in one year. That means a lot of new yards and a lot of dogs.'),
        ]),
        faq_h2='Goodyear questions',
        faq=faqs('Goodyear', [
            ('Do you serve all of Goodyear?', 'Yes. We scoop every home in both Goodyear ZIP codes, 85338 and 85395, plus Goodyear homes with Litchfield Park 85340 addresses. That includes Estrella, CantaMia, Canyon Trails, Palm Valley, PebbleCreek and Sedella.'),
            ('Does Goodyear really require pickup twice a week?', 'Yes. Goodyear city code says droppings must be removed from yards at least twice a week. To match that rule, pick our twice a week plan. It is $189 a month for 1 or 2 dogs.'),
            ('Do you serve PebbleCreek and CantaMia?', 'Yes. Both are gated, and both are in our service area. Add your gate code in My Yard. Only your scooper sees it, and only on your day.'),
            ('Is it illegal to not pick up dog poop in Goodyear?', 'Yes. Goodyear city code says droppings must be removed from yards at least twice a week, and pets cannot cause flies, smell or piles of droppings. On walks, you must pick up right away on public land and other people’s land.'),
            ('Can I report my neighbor for dog poop in Goodyear?', 'Yes. You can report it to the City of Goodyear. If you have an HOA, you can tell them too. Talking to your neighbor first often works best.'),
            ('How many dogs can I have in Goodyear?', 'Goodyear allows up to four household pets at a home. Dogs, cats and potbellied pigs all count toward the four.'),
        ], 'Seal it in a plastic bag and put it in your tan trash cart. Goodyear says pet waste never goes in the green recycle cart. On our visits, we bag it and haul it away for you.'),
        nearby=nearby([L, B, C, W, ALL], 'Live in Avondale? Join the waitlist when you book.'),
    ),
    dict(
        file=L[0], id='l', area='litchfield', name='Litchfield Park', eyebrow='Litchfield Park, AZ · ZIP 85340', h='12200',
        intro=INTRO % 'Litchfield Park',
        map_h2='We cover all of Litchfield Park, AZ',
        where='Every home. Every street. Litchfield Park ZIP 85340.',
        why_h2='Why Litchfield Park yards need weekly pickup',
        why=why([
            ('Big lots and old trees.', 'Litchfield Park started in 1916 as a cotton farm for Goodyear Tire, and the older part of town still has big lots and old shade trees. Dogs love shady spots, and poop under trees is easy to miss.'),
            ('Golf course living.', 'Many homes sit on or near The Wigwam golf courses. Nobody wants a yard that smells next to the fairway.'),
            ('The city has rules.', 'Litchfield Park dog owners must pick up poop right away in parks, on public land and on any land they do not own.'),
            ('Summer heat.', 'Summers here are hot. Heat makes poop smell worse and brings flies. Weekly pickup stops the smell before it starts.'),
        ]),
        faq_h2='Litchfield Park questions',
        faq=faqs('Litchfield Park', [
            ('Do you serve all of Litchfield Park?', 'Yes. We scoop every home with a Litchfield Park 85340 address, inside the city and out. That includes Litchfield Greens, The Village, Cachet, Dreaming Summit, Wigwam Creek, Russell Ranch, Savannah, Windrose and Canyon Views.'),
            ('Is it illegal to not pick up dog poop in Litchfield Park?', 'Yes, in a lot of places. City code says you must pick up dog poop right away in parks, on public land and on any land you do not own. Outside city limits, the county health code says animal waste must be handled so it does not breed insects.'),
            ('Can I report my neighbor for dog poop in Litchfield Park?', 'Yes. You can contact the City of Litchfield Park, or Maricopa County if you live outside city limits. If you have an HOA, you can tell them too. Talking to your neighbor first often works best.'),
            ('Can you get into gated neighborhoods like Cachet and Dreaming Summit?', 'Yes. Add your gate code in My Yard. Only your scooper sees it, and only on your day.'),
        ], 'Bag it, tie the bag, and put it in your trash can. Litchfield Park code says dog poop goes in a closed bag and then in the trash. Never put it in the recycle bin. On our visits, we bag it and haul it away for you.'),
        nearby=nearby([G, B, C, W, ALL], 'Live in Avondale? Join the waitlist when you book.'),
    ),
    dict(
        file=C[0], id='c', area='citrus', name='Citrus Park', eyebrow='Citrus Park · Waddell, AZ · ZIP 85355', h='11400',
        intro=INTRO % 'Citrus Park',
        map_h2='We cover all of Citrus Park, AZ',
        where='Every home. Every street. Citrus Park uses Waddell ZIP 85355, and a few homes use 85340.',
        why_h2='Why Citrus Park yards need weekly pickup',
        why=why([
            ('Big lots and green grass.', 'Many Citrus Park homes sit on an acre or more with flood irrigation, so the grass stays green. Thick grass hides poop, and dogs have lots of room to roam.'),
            ('Water day spreads it.', 'Flood irrigation can wash poop across the whole yard. Weekly pickup keeps the grass clean before the water comes.'),
            ('Horse country.', 'Horse properties are common out here, and flies love the heat. Fewer piles in the yard means fewer flies at the back door.'),
            ('Summer heat.', 'Summers are hot, and hot poop smells worse. Weekly pickup stops the smell before it starts.'),
        ]),
        faq_h2='Citrus Park questions',
        faq=faqs('Citrus Park', [
            ('Do you serve all of Citrus Park?', 'Yes. We scoop all of Citrus Park. Most homes here have Waddell 85355 addresses. Some, like Russell Ranch and Savannah, have Litchfield Park 85340 addresses, and we scoop those too.'),
            ('Do you clean big grass yards?', 'Yes. We walk your yard in rows and pick up every pile, even on an acre. Then we spray deodorizer where your dogs go most. The spray is free.'),
            ('Is the price higher for a big lot?', 'No. Your price depends on how often we come and how many dogs you have, not the size of your yard.'),
            ('Is it illegal to not pick up dog poop in Citrus Park?', 'Citrus Park follows Maricopa County rules. The county health code treats animal waste as trash that must be handled so it does not breed insects, and dogs must be fenced in or leashed.'),
            ('Can I report a neighbor for dog poop in Citrus Park?', 'Yes. Citrus Park is county land, so you contact Maricopa County. If you have an HOA, you can tell them too. Talking to your neighbor first often works best.'),
        ]),
        nearby=nearby([W, L, G, B, ALL], 'Live in Surprise? Join the waitlist when you book.'),
    ),
    dict(
        file=V[0], id='v', area='verrado', name='Verrado', eyebrow='Verrado · Buckeye, AZ · ZIP 85396', h='11600',
        intro=INTRO % 'Verrado',
        map_h2='We cover all of Verrado',
        where='Every home. Every district. Verrado is ZIP 85396. We cover the rest of Buckeye too.',
        why_h2='Why Verrado yards need weekly pickup',
        why=why([
            ('Verrado is made for dogs.', 'Verrado has dozens of small parks, more than 20 miles of trails and two dog parks. Active dogs mean a busy yard.'),
            ('Small yards fill up fast.', 'Many Verrado homes have small turf or rock yards. With one or two dogs, a small yard gets messy in a few days.'),
            ('The HOA cares.', 'Verrado rules say dog poop must be picked up right away, anywhere in Verrado. A clean yard keeps you on good terms with the HOA and your neighbors.'),
            ('Summer heat.', 'Verrado sits at the foot of the White Tank Mountains, and summers are hot. Heat makes poop smell worse and brings flies. Weekly pickup stops the smell before it starts.'),
        ]),
        faq_h2='Verrado questions',
        faq=faqs('Verrado', [
            ('Do you serve all of Verrado?', 'Yes. We scoop every Verrado district: Main Street, Heritage, Marketside, Village, Highlands, Regent Hills and Victory. All of Verrado is in ZIP 85396.'),
            ('Can you get into Regent Hills?', 'Yes. Add your gate code or gate app steps in My Yard. Only your scooper sees it, and only on your day.'),
            ('Is it illegal to not pick up dog poop in Verrado?', 'Yes. Verrado rules say anyone walking a dog must pick up the poop right away, anywhere in Verrado. Buckeye city code also says animal poop cannot be left in a way that is not clean, even in your own yard.'),
            ('Can I report a neighbor for dog poop in Verrado?', 'Yes. You can tell the Verrado Community Association, and you can call the City of Buckeye. Talking to your neighbor first often works best.'),
        ], BUCKEYE_TRASH),
        nearby=nearby([B, G, L, C, W, ALL], 'Sundance, Tartesso and Festival Ranch are on our Buckeye page.'),
    ),
    dict(
        # Waddell, AZ 85355. Every fact here was checked on November 16, 2026. The sources are in research/waddell-sources.md.
        file=W[0], id='w', area='waddell', name='Waddell', eyebrow='Waddell, AZ · ZIP 85355', h='12600',
        intro='Arizona Pet Waste scoops dog poop at homes all over Waddell, AZ every week and hauls it away. '
              'You get a text the night before, a live map of our truck, and a photo of your latched gate when we leave.',
        map_h2='We cover all of Waddell, AZ',
        where='Every home. Every street. Waddell is ZIP 85355, and we scoop all of it.',
        why_h2='Why Waddell yards need weekly pickup',
        why=why([
            ('New homes keep coming.', 'Waddell is growing fast. White Tank Foothills is planned for up to 1,746 homes, and the homes in Zanjero Pass and Stonebridge Manor went up in just the last few years. New turf and rock yards start to smell fast in the sun.'),
            ('Some yards are huge.', 'Not every Waddell yard is small. Lots in Twelve Oaks Estates and Sonoran Ridge Estates are about three quarters of an acre. That is a lot of ground to walk with a scooper, so we walk it in rows for you.'),
            ('The desert is right there.', 'Waddell sits at the foot of the White Tank Mountains, next to the biggest regional park in Maricopa County. Desert heat bakes a yard fast, and warm poop draws flies. It pays to get it out each week.'),
            ('The rules change by street.', 'Most of Waddell is county land. Some homes, like the ones in Zanjero Pass, are inside the City of Glendale. Most new neighborhoods have an HOA too. A clean yard keeps you on the right side of all three.'),
        ]),
        faq_h2='Waddell questions',
        faq=faqs('Waddell', [
            ('Do you serve all of Waddell?', 'Yes. We scoop every home with a Waddell 85355 address. That includes White Tank Foothills, Zanjero Pass, Cortessa, Granite Vista, Stonebridge Manor, Sentiero at Windrose and Citrus Park.'),
            ('Is Waddell, AZ a city?', 'No. Waddell is a place name and a mailing address, ZIP 85355. Most homes here sit on county land. Some, like the ones in Zanjero Pass, are inside the City of Glendale. We scoop them all.'),
            ('Is it illegal to not pick up dog poop in Waddell?', 'It depends on where your home sits. On county land, dogs must be fenced in or leashed, and the county health code treats animal waste as trash that must be handled so it does not breed insects. '
                                                               'Inside Glendale, city code says to clean animal waste out of your yard at least twice a week. Most HOAs have their own rules too.'),
            ('Can I report a neighbor for dog poop in Waddell?', 'Yes. On county land, you contact Maricopa County. Inside Glendale, you contact the city. If you have an HOA, you can tell them too. Talking to your neighbor first often works best.'),
            ('Can I take my dog to White Tank Mountain Regional Park?', 'Yes. Dogs are welcome on a leash 6 feet long or shorter. The county lists five trails there as good for dogs, and the park has dog water fountains. Bag the poop and use the trash cans at the trailhead.'),
            ('Can you get into gated neighborhoods like Laureate at Cortessa?', 'Yes. Add your gate code in My Yard. Only your scooper sees it, and only on your day.'),
        ]),
        nearby=nearby([C, L, G, B, ALL], 'Have a Surprise ZIP code, like 85388? Join the waitlist when you book.'),
    ),
]

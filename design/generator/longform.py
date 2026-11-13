"""Long form copy for the town pages: every neighborhood, local rules, dog parks, the year in a yard,
and what to ask before you hire. No citations on the page: facts are checked, then written plainly in our own words. Written short and plain (about a 3rd to 5th grade reading level).

Each town gives:
  zips:     [(zip, label)] in the order the page shows them
  hoods:    [(name, zip, text)] one card per neighborhood, text is 2 to 4 short sentences
  sections: [(id, h2, [(h3, text)])] text is paragraphs split by a blank line; lines that start with "- " are a list
Links to our own pages use the canvas file names (CityVerrado.dc.html and so on); the site export maps them."""
import html as _html
import re

UPDATED = 'November 7, 2026'

# ---------- shared copy ----------

PRICES = ('Every week is about $25 a week for 1 or 2 dogs. We bill it once a month: $108 on the 1st. Every other week is $75 a month, '
          'and twice a week is $189 a month. Each dog after two adds $13 a month ($9 every other week).')


def ask(town, zips):
    """What to ask before you hire a pooper scooper, with our answers."""
    return [
        ('Do you come to my street?', 'We scoop every home in %s. Type your ZIP when you book, and we tell you right away.' % zips),
        ('Are you bonded and insured?', '[[ins:We are bonded today. We carry a $50,000 business service bond. Our $1,000,000 general liability insurance starts November 16, 2026.||Yes. We carry a $50,000 business service bond and $1,000,000 in general liability insurance.]] See the details on our bond and insurance page.'),
        ('Is there a sign up fee?', 'Not with us. [[bf:You pay $0 today. Black Friday sale: sign up by November 30 and your first month is free.||There is no sign up fee, and your first cleanup is free.]]'),
        ('How much is each visit?', PRICES),
        ('Is the spray extra?', 'No. At every visit, we spray deodorizer on the spots your dogs use most. It is free.'),
        ('How will I know you came?', 'You get a text the night before with a 30 minute window. On your day, you can watch our truck on a live map. '
                                      'When we leave, we send you a photo of your latched gate.'),
        ('What do you do with the poop?', 'We haul it away. We bag it and take it with us. It does not go in your trash can.'),
        ('Do you clean your tools?', 'Yes. We clean our boots and tools after every yard. That keeps germs from going from yard to yard.'),
        ('What if you miss a pile or forget the photo?', 'Tap “Something’s off” in My Yard, and we come back for free within 24 hours. '
                                                       'If a visit has no gate photo, you pay $0 for that visit.'),
        ('Do I have to sign a contract?', 'No. You pay month to month. You can pause or cancel any time in My Yard. If you cancel in your first 60 days, we charge one month.'),
    ]


def seasons(town, july):
    """The year in a West Valley yard. july = a plain sentence about July heat."""
    return [
        ('Summer heat', july + ' Heat makes dog poop smell worse, and flies lay their eggs in it. Turf gets hot too. '
                        'On a 95 degree morning, the top of a turf yard can pass 150 degrees. '
                        'In summer, we start early, so your yard is done before the worst heat of the day.'),
        ('Monsoon storms', 'Monsoon season runs from June 15 to September 30. A big storm can wash dog poop out of your yard and into the street. '
                           'From there, it flows into the storm drain, and storm drain water is not cleaned before it reaches our rivers and lakes. '
                           'If lightning is close, we wait until it is safe, and we text you if your time changes.'),
        ('Fall, winter and spring', 'The cool months are the nicest time of year here, so dogs play outside more. More play means more poop. '
                                    'Germs do not go away when it cools down. Worm eggs from dog poop can live in a yard for weeks or even years. '
                                    'That is why the rule of thumb is to pick up the yard at least once a week, all year.'),
    ]


def faq_common(town):
    """Questions every town page answers. Town pages add their own on top."""
    return [
        ('How much does a pooper scooper cost in %s?' % town,
         'With us, weekly pickup is about $25 a week for 1 or 2 dogs. We bill it once a month: $108 on the 1st. Every other week is $75 a month. '
         'There is no sign up fee, the spray is free, and [[bf:with the Black Friday sale your first month is free||your first cleanup is free]]. When you compare, ask if a price is per visit or per month, '
         'if there is a first cleanup fee, and if spray costs extra.'),
        ('Where should I throw away dog poop?',
         'Bag it, tie the bag, and put it in your trash can. Do not put it in the recycle bin, and never hose it into the street or a storm drain. '
         'On our visits, we bag it and haul it away for you.'),
        ('Do you clean turf and rock yards?',
         'Yes. We pick up every pile on turf, grass and rock. We rake rock and gravel with a wide metal rake, then spray deodorizer where your dogs go most. The spray is free.'),
        ('Can you get rid of turf smell?',
         'Every visit comes with a free deodorizer spray. For a deeper clean, add a turf odor treatment for $35. It helps when pee smell builds up in hot turf.'),
        ('Do you do one time cleanups?',
         'Yes. A one time cleanup is $95. It is a good pick before a party, after a move, or when the yard got away from you.'),
        ('Can you come the same day?',
         'Yes. If you have a party or guests coming, text us and we can come the same day for $49. It goes on your next bill on the 1st.'),
        ('Do I need to be home?',
         'No. Most of our customers are at work. Add your gate code in My Yard, and we send a photo of your latched gate when we leave.'),
        ('What if my dog is in the yard?',
         'Tell us in My Yard. If a dog in the yard is not safe to be near, we do not go in. We text you to bring the dog inside, and we can come back the same day.'),
        ('Can I skip a week or pause?',
         'Yes. You get 4 free skips a year. Tell us 24 hours before. After your first 60 days, you can pause for up to 120 days while you are away, and you do not pay while you are paused.'),
        ('Is there a contract?',
         'No. You pay month to month and can cancel any time in My Yard. There is no phone call to cancel. If you cancel in your first 60 days, we charge one month.'),
    ]


# ---------- renderers ----------

def _inline(s):
    """Keep our own small markup (<a>, <strong>, <em>) and escape nothing else that is already safe."""
    return s


def _blocks(text):
    out = []
    for para in [p.strip() for p in text.strip().split('\n\n') if p.strip()]:
        lines = [l.strip() for l in para.split('\n') if l.strip()]
        if all(l.startswith('- ') for l in lines):
            out.append('<ul>' + ''.join('<li>%s</li>' % _inline(l[2:]) for l in lines) + '</ul>')
        else:
            out.append('<p>%s</p>' % _inline(' '.join(lines)))
    return ''.join(out)


def _section(sid, h2, body, bg):
    return ('  <details id="%s" class="fold lf"><summary><h2 class="fold-h">%s</h2></summary><div class="foldb lfb">\n%s\n  </div></details>\n') % (sid, h2, body)


def hoods_section(t, town):
    cards = ''.join(
        '<article class="hcard"><h3>%s</h3><p class="hz mono">ZIP %s</p>%s</article>' % (name, z, _blocks(text))
        for name, z, text in t['hoods'])
    return ('  <details id="neighborhoods" class="fold lf"><summary><h2 class="fold-h">%s</h2></summary><div class="foldb">\n'
            '    <p class="cp">%s</p>\n  <div class="hcards" style="margin-top: 16px;">%s</div>\n  </div></details>\n') % (t['hoods_h2'], t['hoods_intro'], cards)


def guide(t, town):
    bgs = ['var(--bg)', 'var(--bg2)']
    out = []
    for i, (sid, h2, items) in enumerate(t['sections']):
        body = ''.join('<h3>%s</h3>%s' % (h3, _blocks(text)) for h3, text in items)
        out.append(_section(sid, h2, body, bgs[i % 2]))
    return ''.join(out)


def render(area, town):
    t = TOWNS.get(area)
    if not t:
        return {'C_HOODS_SEC': '', 'C_GUIDE': '', 'C_SOURCES': ''}
    return {
        'C_HOODS_SEC': hoods_section(t, town),
        'C_GUIDE': guide(t, town),
        'C_SOURCES': '',
    }


def zip_groups(area):
    """For the site build: each ZIP with its label and neighborhood names, in page order."""
    t = TOWNS.get(area)
    if not t:
        return []
    return [{'zip': z, 'label': label, 'names': [re.sub(r'<[^>]+>', '', n) for n, hz, _ in t['hoods'] if hz == z]} for z, label in t['zips']]


def word_count(area):
    t = TOWNS[area]
    text = ' '.join([t['hoods_intro']] + [x[2] for x in t['hoods']] + [b for _, _, items in t['sections'] for h, b in items] + [h for _, _, items in t['sections'] for h, b in items])
    return len(re.sub(r'<[^>]+>', ' ', text).split())


TOWNS = {}

# ---------- Buckeye (85326, 85396) ----------
TOWNS['buckeye'] = dict(
    zips=[('85396', 'North Buckeye'), ('85326', 'Buckeye town and south')],
    hoods_h2='Buckeye neighborhoods we scoop',
    hoods_intro='We scoop every home in Buckeye, in both ZIP codes. These are some of the neighborhoods we cover. '
                'If your ZIP is 85326 or 85396 and you do not see your neighborhood, we still come to you.',
    hoods=[
        ('Verrado', '85396', 'Verrado sits at the foot of the White Tank Mountains, right off the Verrado Way exit on Interstate 10. '
                             'It has dozens of small parks, miles of trails and two dog parks for residents. '
                             'We scoop every Verrado district. <a href="CityVerrado.dc.html">See our Verrado page</a>.'),
        ('Victory at Verrado', '85396', 'Victory is the 55 plus part of Verrado, with the Victory Club and more than 21 miles of trails. '
                                        'Skip the bending and the heat. We pick up the yard, and you get your morning back.'),
        ('Sun City Festival', '85396', 'Sun City Festival is a 55 plus Del Webb community about 17 miles north of Interstate 10 on Sun Valley Parkway. '
                                       'It is a long drive from town. We still come, and the price is the same.'),
        ('Festival Foothills', '85396', 'Festival Foothills is the all ages side of Festival Ranch, next to Sun City Festival on Sun Valley Parkway. '
                                        'Lots of young families and lots of dogs live here. We scoop every home.'),
        ('Tartesso', '85396', 'Tartesso is about 3.5 miles north of Interstate 10 on Sun Valley Parkway, with a big sports park in the middle. '
                              'We come to every street in Tartesso.'),
        ('Teravalis', '85396', 'Teravalis is the newest part of Buckeye. It sits between the White Tank and Belmont Mountains, and it opened in late 2025. '
                               'New homes mean new yards, and we are ready for them.'),
        ('Sienna Hills', '85396', 'Sienna Hills is near McDowell Road and Verrado Way. It has a swim park, a community park and a hiking trail. '
                                  'We pick up yards here too.'),
        ('Arroyo Seco', '85396', 'Arroyo Seco is a newer neighborhood in north Buckeye with open space, playgrounds and sport courts. '
                                 'Most yards here are turf, rock or both, and we clean all of it.'),
        ('Sundance', '85326', 'Sundance is a big master planned neighborhood with a 55 plus section and Sundance Park close by. '
                              'The park has an off leash dog area, so your dog may already know the way.'),
        ('Westpark', '85326', 'Westpark is south of Interstate 10, with Westpark Elementary right in the neighborhood. '
                              'Kids play in these yards every day, so a clean yard matters.'),
        ('Blue Horizons', '85326', 'Blue Horizons is on the east side of Buckeye, near Blue Horizons Elementary. '
                                   'We scoop every home here, front gate to back wall.'),
        ('Historic downtown Buckeye', '85326', 'Downtown Buckeye grew up around Monroe Avenue, where the town started more than 100 years ago. '
                                               'Older homes, older yards, same weekly pickup.'),
        ('Montaña Vista', '85326', 'Montaña Vista is a newer neighborhood near Interstate 10. Its park has walking trails and dog cleanup stations. '
                                   'We take care of the yard at home.'),
        ('Apache Farms', '85326', 'Apache Farms is on Broadway Road near 239th Avenue, with parks, trails and playgrounds. '
                                  'It is a great spot for dogs, and we keep up with them.'),
        ('Anderson Parc', '85326', 'Anderson Parc is a newer neighborhood in south Buckeye with tot lots and open space. '
                                   'New turf can start to smell fast in the heat, so weekly pickup helps.'),
        ('Copper Falls', '85326', 'Copper Falls is a master planned neighborhood on the west side of Buckeye. We scoop here every week of the year.'),
        ('Desert Moon Estates', '85326', 'Desert Moon Estates is near 240th Avenue and Ripple Road, with parks, trails and sport courts.'),
        ('Ventana Ranch', '85326', 'Ventana Ranch is a newer neighborhood in south Buckeye with sport courts and a playground.'),
        ('Watson Estates', '85326', 'Watson Estates is a family neighborhood in south Buckeye with homes built from 2008 on.'),
    ],
    sections=[
        ('rules', 'Buckeye rules about dog poop', [
            ('It is the law, even in your own yard', 'Buckeye city code says animal poop cannot be left in a way that is not clean, on public land or private land. '
                                                     'Private land includes your own yard. So in Buckeye, keeping your yard picked up is the rule.'),
            ('Dogs stay on a leash', 'Dogs cannot run loose in Buckeye. Off your property, keep your dog on a leash. '
                                     'Buckeye animal rules carry fines that start at $150 for a first offense.'),
            ('HOA rules', 'Most Buckeye neighborhoods have an HOA, and HOAs care about smell, flies and how a yard looks. '
                          'Verrado, for one, says anyone walking a dog must pick up the poop right away, anywhere in Verrado. '
                          'A clean yard keeps you on good terms with the HOA and the neighbors.'),
            ('Where the poop goes', 'Bag it, tie the bag, and put it in your trash cart. Buckeye wants all trash bagged and tied. '
                                    'The recycle cart is only for clean, loose items, so dog poop never goes there.'),
        ]),
        ('parks', 'Dog parks and trails in Buckeye', [
            ('Sundance Park', 'Sundance Park at 22865 W Lower Buckeye Road has an off leash dog area with space for big and small dogs. '
                              'It is open from dawn to 10 p.m., but on Wednesdays it opens at 2 p.m. There is a fishing lake too.'),
            ('Skyline Regional Park', 'Skyline Regional Park is a big mountain park at 2600 N Watson Road, with more than 20 miles of trails in the White Tank Mountains. '
                                      'Leashed dogs are welcome. In summer, go early and bring water for your dog.'),
            ('Verrado dog parks', 'Verrado has two dog parks for residents and their guests. Granite Bluff Dog Park, off Verrado Way, opened in 2024 '
                                  'with two dog areas, water and waste stations. Marketside Dog Park is at the end of Marketside Avenue by Thomas Road.'),
            ('Sun City Festival Pet Park', 'Sun City Festival has a pet park just for residents on Firehawk Drive.'),
        ]),
        ('year', 'Your Buckeye yard all year', seasons('Buckeye', 'Buckeye summers are long and hot. In July, the normal high in the Phoenix area is about 106 degrees.')),
        ('ask', 'What to ask before you hire a pooper scooper in Buckeye', ask('Buckeye', 'both Buckeye ZIP codes, 85326 and 85396')),
    ],
)

# ---------- Verrado (85396, inside Buckeye) ----------
TOWNS['verrado'] = dict(
    zips=[('85396', 'Verrado districts')],
    hoods_h2='Verrado districts we scoop',
    hoods_intro='We scoop every home in Verrado, in every district. All of Verrado uses ZIP 85396. '
                'Here is a quick look at each part of Verrado, plus the neighborhoods right next door.',
    hoods=[
        ('Main Street District', '85396', 'The Main Street District is the small downtown of Verrado, built around the Village Green. '
                                          'Homes here are close to the shops and the town square, and so are a lot of dogs.'),
        ('Heritage District', '85396', 'The Heritage District has Heritage Swim Park and Verrado Heritage Elementary. '
                                       'Lots of families, lots of dogs, and lots of yards to keep clean.'),
        ('Marketside District', '85396', 'Marketside is the newer part of Verrado by Interstate 10, close to Verrado Marketplace and the Marketside Dog Park.'),
        ('Village District', '85396', 'The Village District is near Jackrabbit Trail and Indian School Road, by the Village Grove shops.'),
        ('Highlands District', '85396', 'The Highlands is one of the Verrado districts. We scoop every street in it, every week of the year.'),
        ('Regent Hills', '85396', 'Regent Hills is a gated neighborhood in the western foothills of Verrado, with a trail up Regent Mountain. '
                                  'A gate is no problem. Add your gate code in My Yard, and we take it from there.'),
        ('Victory at Verrado', '85396', 'Victory is the 55 plus district of Verrado, with the Victory Club, pickleball and more than 21 miles of trails. '
                                        'Skip the bending and the heat. We pick up the yard, and you head to the club.'),
        ('Sienna Hills', '85396', 'Sienna Hills is right next to Verrado, near McDowell Road and Verrado Way. We scoop there too.'),
        ('Arroyo Seco', '85396', 'Arroyo Seco is a newer neighborhood close to Verrado, with open space and playgrounds. Same price, same weekly visit.'),
    ],
    sections=[
        ('rules', 'Verrado rules about dog poop', [
            ('The Verrado rule', 'Verrado rules say anyone walking a dog must pick up the poop right away, anywhere in Verrado. '
                                 'Dogs must be on a leash or kept inside a yard when they are outside the home. '
                                 'The park rules say the same thing: leash your dog and pick up after it.'),
            ('The Buckeye rule', 'Verrado is in the City of Buckeye. Buckeye city code says animal poop cannot be left in a way that is not clean, '
                                 'on public land or private land, and that includes your own backyard.'),
            ('Where the poop goes', 'Bag it, tie the bag, and put it in your trash cart. Buckeye wants all trash bagged and tied. '
                                    'Dog poop never goes in the recycle cart.'),
        ]),
        ('parks', 'Verrado dog parks and trails', [
            ('Granite Bluff Dog Park', 'Granite Bluff Dog Park is at Granite Bluff Drive and Verrado Way, and you enter on Fern Drive. '
                                       'It opened in 2024 for residents and their guests. It has two dog areas, a dog fountain and a waste station in each, '
                                       'and the gate opens with an app. From September to April it is open 7 a.m. to 7 p.m. From May to August it is open 6 a.m. to 8 p.m.'),
            ('Marketside Dog Park', 'Marketside Dog Park is at the end of Marketside Avenue by Thomas Road. It has gated grass, shade and water.'),
            ('Wood’s Run Park', 'Wood’s Run Park on W Shadow Street is a good spot for a walk with your dog on a leash.'),
            ('Trails', 'Verrado has more than 20 miles of trails. From Regent Hills, the trails connect to Lost Creek Trail and Skyline Regional Park, '
                       'where leashed dogs are welcome. In summer, go early and bring water.'),
        ]),
        ('year', 'Your Verrado yard all year', seasons('Verrado', 'Verrado sits at the foot of the White Tank Mountains, and summers are hot. '
                                                               'In July, the normal high in the Phoenix area is about 106 degrees.')),
        ('ask', 'What to ask before you hire a pooper scooper in Verrado', ask('Verrado', 'Verrado and the rest of ZIP 85396')),
    ],
)

# ---------- Litchfield Park (85340) ----------
TOWNS['litchfield'] = dict(
    zips=[('85340', 'Litchfield Park')],
    hoods_h2='Litchfield Park neighborhoods we scoop',
    hoods_intro='We scoop every home with a Litchfield Park 85340 address. That means the City of Litchfield Park, plus the neighborhoods '
                'around it that share the same ZIP code, even the ones that sit in the county, Buckeye, Goodyear or Glendale.',
    hoods=[
        ('Old Litchfield', '85340', 'Old Litchfield is the historic heart of town, along Old Litchfield Road next to The Wigwam. '
                                    'There is no HOA, and many lots are big, with old trees and lots of shade. Shady spots are where poop hides.'),
        ('Litchfield Greens', '85340', 'Litchfield Greens is a golf neighborhood off Litchfield Road, just south of Camelback Road. '
                                       'Some homes back up to The Wigwam golf course.'),
        ('The Village at Litchfield Park', '85340', 'The Village is off Litchfield Road at Village Parkway, with a community pool and playground. '
                                                    'Rose Park and Aleppo Park are right there for walks.'),
        ('Cachet at the Wigwam', '85340', 'Cachet is a gated golf community at Litchfield Road and Village Parkway, next to The Wigwam golf course. '
                                          'A gate is no problem. Add your gate code in My Yard.'),
        ('Litchfield Park Villas', '85340', 'Litchfield Park Villas are condos on Old Litchfield Road. If your dog has a patio or small yard, we keep it clean.'),
        ('Dreaming Summit', '85340', 'Dreaming Summit is just north of Litchfield Park, with four gated areas and a 22 acre private park. '
                                     'It shares the 85340 ZIP code, so we come to you.'),
        ('Wigwam Creek North', '85340', 'Wigwam Creek North is off Camelback Road at Wigwam Creek Boulevard. We scoop every street.'),
        ('Wigwam Creek South', '85340', 'Wigwam Creek South is near Dysart Road and Camelback Road, close to Wigwam Creek Middle School.'),
        ('Russell Ranch', '85340', 'Russell Ranch is near Camelback Road and Citrus Road. Many homes sit on big lots, some close to an acre. '
                                   'Big yard? We walk it in rows.'),
        ('Savannah', '85340', 'Savannah is near Camelback Road and Perryville Road, with bigger lots and a neighborhood playground.'),
        ('Windrose', '85340', 'Windrose is near Perryville Road and Camelback Road, with a big park at Missouri Avenue and 189th Avenue. '
                              'Part of Windrose uses Litchfield Park 85340 and part uses Waddell 85355. We scoop both.'),
        ('Canyon Views', '85340', 'Canyon Views is at Jackrabbit Trail and Montebello Avenue. It is part of Buckeye, but the mail says Litchfield Park 85340. '
                                  'Either way, we come to you.'),
        ('Allen Ranches', '85340', 'Allen Ranches is a newer neighborhood with Litchfield Park 85340 addresses inside the City of Glendale. We scoop it too.'),
        ('Palm Valley homes', '85340', 'Some Palm Valley homes in Goodyear, like Villagio and Cabada Corners, use 85340 addresses. We scoop those as well.'),
    ],
    sections=[
        ('rules', 'Litchfield Park rules about dog poop', [
            ('Pick it up right away', 'In Litchfield Park, dog owners must pick up dog poop right away in parks, on public land, and on any land they do not own. '
                                      'The poop goes in a closed bag, and then in a trash can.'),
            ('Leash rules', 'Dogs cannot run loose. In city parks, dogs must be on a leash 6 feet long or shorter. '
                            'Breaking the leash rule can bring a fine of up to $2,500.'),
            ('Outside city limits', 'Many 85340 homes, like Wigwam Creek, Dreaming Summit, Russell Ranch and Windrose, sit in Maricopa County, not the city. '
                                    'County rules say dogs must be fenced in or on a leash 6 feet long or shorter. '
                                    'The county health code also treats animal waste as trash that must be handled so it does not breed insects.'),
            ('Who handles animal problems', 'Litchfield Park uses Maricopa County Animal Care and Control for animal problems, inside the city and out.'),
        ]),
        ('parks', 'Dog parks and walks near Litchfield Park', [
            ('No dog park in town', 'Litchfield Park does not have its own dog park. The city points dog owners to nearby parks in Goodyear and Avondale, '
                                    'like Friendship Park at 12325 W McDowell Road.'),
            ('Walks in town', 'Tierra Verde Lake Park on Old Litchfield Road has a path around the lake and a drinking fountain for dogs. '
                              'Turtle Park and Camelback Park on Villa Nueva Drive have dog fountains too. Kiwanis Park has a walking trail and a cactus garden.'),
            ('White Tank Mountain Regional Park', 'White Tank Mountain Regional Park is a short drive west, with nearly 30,000 acres of desert. '
                                                  'Dogs are welcome on a leash 6 feet long or shorter. Bring bags and carry the poop out.'),
        ]),
        ('year', 'Your Litchfield Park yard all year', seasons('Litchfield Park', 'Summers here are hot. In July, the normal high in the Phoenix area is about 106 degrees.')),
        ('ask', 'What to ask before you hire a pooper scooper in Litchfield Park', ask('Litchfield Park', 'ZIP 85340, inside city limits and out')),
    ],
)

# ---------- Citrus Park and Waddell (85355) ----------
TOWNS['citrus'] = dict(
    zips=[('85355', 'Waddell and Citrus Park'), ('85340', 'Citrus Park homes with Litchfield Park addresses')],
    hoods_h2='Citrus Park and Waddell neighborhoods we scoop',
    hoods_intro='We scoop every home in Waddell ZIP 85355, including all of Citrus Park. '
                'Some Citrus Park homes have Litchfield Park 85340 addresses, and we scoop those too.',
    hoods=[
        ('Citrus Park', '85355', 'Citrus Park is east of Perryville Road and south of Northern Avenue, between Goodyear and Glendale. '
                                 'It is not part of any city. It is known for big lots, horse properties and flood irrigation.'),
        ('Clearwater Farms', '85355', 'Clearwater Farms is around Citrus Road and Glendale Avenue. Many lots are one to two acres, with horse corrals and irrigated grass. '
                                      'Big green yards hide poop, so we walk them in rows.'),
        ('Tara Estates', '85355', 'Tara Estates has large homes built from 2006 on. Big homes come with big yards to keep clean.'),
        ('Sentiero at Windrose', '85355', 'Sentiero is the Waddell part of Windrose, on the Litchfield Park border, with greenbelts, parks and trails.'),
        ('White Tank Foothills', '85355', 'White Tank Foothills is a growing area of new homes in Waddell. New homes mean new turf and rock yards, and we clean both.'),
        ('Zanjero Pass', '85355', 'Zanjero Pass is a newer neighborhood in Waddell with pickleball, a park, tot lots and trails.'),
        ('Cortessa', '85355', 'Cortessa is a gated neighborhood off Peoria Avenue, and some lots are a full acre. Add your gate code in My Yard, and we take it from there.'),
        ('Granite Vista', '85355', 'Granite Vista is off Cotton Lane near Olive Avenue. We scoop every home here.'),
        ('Stonebridge Manor', '85355', 'Stonebridge Manor is on the east side of Waddell, and it uses Waddell 85355 addresses. Same price, same weekly visit.'),
        ('Russell Ranch', '85340', 'Russell Ranch is near Camelback Road and Citrus Road, inside the Citrus Park area, with Litchfield Park addresses. '
                                   'Some lots are close to an acre.'),
        ('Savannah', '85340', 'Savannah is near Camelback Road and Perryville Road, inside the Citrus Park area, with Litchfield Park addresses.'),
    ],
    sections=[
        ('rules', 'Citrus Park and Waddell rules about dog poop', [
            ('County land, county rules', 'Citrus Park and Waddell are not part of a city, so Maricopa County rules apply. '
                                          'Dogs must be fenced in or on a leash 6 feet long or shorter. '
                                          'The county health code treats animal waste as trash that must be handled so it does not breed insects.'),
            ('Pick up before water day', 'Flood irrigation can spread dog poop across the whole yard. '
                                         'Picking up before your water day keeps it from floating out into the grass.'),
            ('Where the poop goes', 'Bag it, tie the bag, and put it in your trash can. Never leave it in an irrigation ditch or a storm drain.'),
        ]),
        ('parks', 'Places to walk your dog near Citrus Park', [
            ('White Tank Mountain Regional Park', 'White Tank Mountain Regional Park is at 20304 W White Tank Mountain Road in Waddell. '
                                                  'At nearly 30,000 acres, it is the biggest regional park in Maricopa County. '
                                                  'Dogs are welcome on a leash 6 feet long or shorter. Bring bags and carry the poop out.'),
            ('Park hours', 'From May to October, the park is open 5 a.m. to 9 p.m. From November to April, it is open 6 a.m. to 8 p.m. '
                           'In summer, hike early and bring water for your dog.'),
            ('Neighborhood parks', 'Windrose has a big community park at Missouri Avenue and 189th Avenue. '
                                   'Newer neighborhoods, like Zanjero Pass and White Tank Foothills, have their own parks and trails.'),
        ]),
        ('year', 'Your Citrus Park yard all year', seasons('Citrus Park', 'Citrus Park summers are hot. In July, the normal high in the Phoenix area is about 106 degrees.')),
        ('ask', 'What to ask before you hire a pooper scooper in Citrus Park', ask('Citrus Park', 'Waddell ZIP 85355, including all of Citrus Park')),
    ],
)

# ---------- Goodyear (85338, 85395, plus 85340 Palm Valley North) ----------
TOWNS['goodyear'] = dict(
    zips=[('85395', 'North Goodyear'), ('85338', 'Central and south Goodyear'), ('85340', 'Goodyear homes with Litchfield Park addresses')],
    hoods_h2='Goodyear neighborhoods we scoop',
    hoods_intro='We scoop every home in Goodyear, in both ZIP codes, 85338 and 85395. A few Goodyear homes use Litchfield Park 85340, '
                'and we scoop those too. These are some of the neighborhoods we cover.',
    hoods=[
        ('PebbleCreek', '85395', 'PebbleCreek is a gated 55 plus resort community off PebbleCreek Parkway, north of Interstate 10. '
                                 'It has 54 holes of golf and a dog park for residents. The HOA wants droppings picked up right away, and we make that easy.'),
        ('Palm Valley', '85395', 'Palm Valley is the big master planned area just north of Interstate 10 along Litchfield Road, '
                                 'home to Palm Valley Golf Club. Palm Valley Park has dog bag stations for your walks.'),
        ('Sedella', '85395', 'Sedella is at Indian School Road and Citrus Road, with gated neighborhoods and Belen Soto Elementary inside.'),
        ('Abel Ranch', '85395', 'Abel Ranch is a newer neighborhood in north Goodyear with a playground, a basketball court and pickleball.'),
        ('Rio Paseo', '85395', 'Rio Paseo is in north Goodyear, with the Cottages and the Villages at Rio Paseo. We scoop every home.'),
        ('Sunrise at Wigwam', '85395', 'Sunrise at Wigwam is in north Goodyear by Litchfield Road, close to The Wigwam.'),
        ('Canada Village', '85395', 'Canada Village is a small north Goodyear neighborhood with no HOA. Small yard or big, same weekly visit.'),
        ('Palm Valley North', '85340', 'Palm Valley North is part of Goodyear, but it uses Litchfield Park 85340 addresses. We come to you either way.'),
        ('Estrella', '85338', 'Estrella, also called Estrella Mountain Ranch, is south of the Gila River, with two private lakes, more than 50 parks '
                              'and more than 65 miles of trails. You get in from Estrella Parkway or Cotton Lane. We scoop every village in Estrella.'),
        ('Montecito in Estrella', '85338', 'Montecito is a village inside Estrella, close to South Lake Park and the Presidio clubhouse.'),
        ('CantaMia at Estrella', '85338', 'CantaMia is the 55 plus village inside Estrella, with a fenced dog park for residents. '
                                          'Let us handle the yard while you enjoy the Village Center.'),
        ('Canyon Trails', '85338', 'Canyon Trails is south of Interstate 10 between Cotton Lane and Estrella Parkway, with paved walking paths and pocket parks. '
                                   'Most homes here were built in the 2000s.'),
        ('Centerra', '85338', 'Centerra is in central Goodyear, close to Estrella Parkway. We pick up every yard, turf, rock or grass.'),
        ('Cottonflower', '85338', 'Cottonflower is near Cotton Lane in south Goodyear.'),
        ('Wildflower Ranch', '85338', 'Wildflower Ranch is one of the older neighborhoods in Goodyear, built mostly in the 1990s, with Wildflower Park North and South inside.'),
        ('Sarival Village', '85338', 'Sarival Village is near Sarival Avenue in south Goodyear, with homes built from 1999 to 2008.'),
        ('Las Brisas', '85338', 'Las Brisas is a neighborhood in south Goodyear near Citrus Road.'),
        ('El Cidro', '85338', 'El Cidro is near Lower Buckeye Road and Cotton Lane, with ramadas, grills, play areas and sport courts.'),
        ('Estrella Vista', '85338', 'Estrella Vista is on the west side of Estrella Parkway, with Estrella Vista Park South on 157th Avenue.'),
        ('Citrus Park in Goodyear', '85338', 'This Citrus Park is a newer neighborhood at Citrus Road and Lower Buckeye Road, with a 5 acre park and pool called The Grove. '
                                             'It is not the same place as <a href="CityCitrusPark.dc.html">Citrus Park near Waddell</a>, and we scoop both.'),
        ('Historic Goodyear', '85338', 'Historic Goodyear is the original part of town, near Litchfield Road and Western Avenue. '
                                       'When Goodyear became a town in 1946, it had just 151 homes.'),
    ],
    sections=[
        ('rules', 'Goodyear rules about dog poop', [
            ('Twice a week, by law', 'Goodyear city code says droppings must be removed from yards at least twice a week, '
                                     'or more often if the heat or health calls for it. Our twice a week plan matches the rule.'),
            ('No smell, no flies', 'The code also says pets cannot cause a nuisance. It names flies, smell and piled up droppings as examples.'),
            ('On walks', 'Off your property, dogs must be on a leash 6 feet long or shorter. You must pick up your dog’s poop right away on public land '
                         'and on other people’s land. City park rules say the same: leash your dog and clean up after it.'),
            ('Four pets per home', 'Goodyear allows up to four household pets at a home. Dogs, cats and potbellied pigs all count toward the four.'),
            ('Where the poop goes', 'Seal it in a plastic bag and put it in your tan trash cart. Pet waste never goes in the green recycle cart.'),
        ]),
        ('parks', 'Dog parks and trails in Goodyear', [
            ('Roscoe Dog Park', 'Roscoe Dog Park at 15600 W Roeser Road covers 6.5 acres, with separate areas for calm dogs and busy dogs. '
                                'It has water fountains for dogs and people, lights, bags, a double gate and a restroom. It is open every day from 6 a.m. to 10 p.m.'),
            ('Goodyear Community Park', 'Goodyear Community Park at Litchfield Road and Thomas Road has a dog park, dog bags and walking trails.'),
            ('Estrella Mountain Regional Park', 'Estrella Mountain Regional Park at 14805 W Vineyard Avenue has almost 20,000 acres and 33 miles of trails. '
                                                'Dogs are welcome on a leash 6 feet long or shorter. Bag the poop and use the trash cans at the trailhead. '
                                                'If the ground is too hot for your hand, it is too hot for paws.'),
            ('Neighborhood dog parks', 'PebbleCreek and CantaMia both have dog parks just for residents. Palm Valley Park has dog bag stations for walks.'),
        ]),
        ('year', 'Your Goodyear yard all year', seasons('Goodyear', 'Goodyear summers are hot. In July, the normal high in the Phoenix area is about 106 degrees.')),
        ('ask', 'What to ask before you hire a pooper scooper in Goodyear', ask('Goodyear', 'both Goodyear ZIP codes, 85338 and 85395')),
    ],
)

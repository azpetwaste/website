"""Build valleydata.json: the whole Phoenix area by ZIP code for the home page map.
ZIP shapes are US Census ZCTAs (via OpenDataDE). Run once with the Arizona file at /home/claude/data/az_zips.json.
Map units: x = (lon + 112.72) * cos(33.5) * K, y = (33.82 - lat) * K, K = 1000 / (1.20 * cos(33.5))."""
import json, math, re
from shapely.geometry import shape, box, Polygon, MultiPolygon, Point
from shapely.ops import unary_union, transform, linemerge

LON0, LON1, LAT0, LAT1 = -112.72, -111.52, 33.16, 33.82
C = math.cos(math.radians(33.5))
K = 1000 / ((LON1 - LON0) * C)
W, H = 1000, round((LAT1 - LAT0) * K)
SERVED = ['85326', '85338', '85340', '85355', '85395', '85396']

def proj(lon, lat):
    return ((lon - LON0) * C * K, (LAT1 - lat) * K)

def path(g, tol=1.4):
    g = g.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]
    out = []
    for p in polys:
        if p.area < 6:
            continue
        for ring in [p.exterior] + list(p.interiors):
            pts = [(round(x), round(y)) for x, y in ring.coords]
            ded = [pts[0]] + [q for i, q in enumerate(pts[1:]) if q != pts[i]]
            if len(ded) < 4:
                continue
            out.append('M' + ' '.join('%d %d' % q for q in ded[:-1]) + 'Z')
    return ''.join(out)

def lines(g, tol=1.4):
    from shapely.geometry import LineString, MultiLineString, GeometryCollection
    from shapely.ops import linemerge
    g = g.simplify(tol, preserve_topology=False)
    parts = []
    def walk(x):
        if isinstance(x, LineString):
            parts.append(x)
        elif isinstance(x, (MultiLineString, GeometryCollection)):
            for y in x.geoms:
                walk(y)
        elif isinstance(x, Polygon):
            parts.append(LineString(x.exterior.coords))
    walk(g)
    out = []
    for ls in parts:
        pts = [(round(a), round(b)) for a, b in ls.coords]
        ded = [pts[0]] + [q for i, q in enumerate(pts[1:]) if q != pts[i]]
        if len(ded) >= 2:
            out.append('M' + ' '.join('%d %d' % q for q in ded))
    return ''.join(out)

d = json.load(open('/home/claude/data/az_zips.json'))
view = box(0, 0, W, H)
zips = {}
for f in d['features']:
    p = f['properties']
    z = p['ZCTA5CE10']
    lat, lon = float(p['INTPTLAT10']), float(p['INTPTLON10'])
    if not (LON0 - 0.08 <= lon <= LON1 + 0.08 and LAT0 - 0.08 <= lat <= LAT1 + 0.08):
        continue
    g = transform(lambda x, y, z=None: proj(x, y), shape(f['geometry']))
    if not g.is_valid:
        g = g.buffer(0)
    g = g.intersection(view)
    if g.is_empty or g.area < 30:
        continue
    zips[z] = g

served = {z: zips[z] for z in SERVED}
soon = unary_union([g for z, g in zips.items() if z not in SERVED])
everything = unary_union(list(zips.values()))

# Verrado from the West Valley map (world units: x = (lon + 112.60) * 1392.4, y = (33.60 - lat) * 1658.55)
md = json.load(open('/home/claude/build/v2/mapdata.json'))
nums = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', md['P_VERRADO'])))
ver = Polygon([proj(x / 1392.4 - 112.60, 33.60 - y / 1658.55) for x, y in zip(nums[::2], nums[1::2])]).buffer(0)

def label_at(g):
    p = g.representative_point()
    return [round(p.x), round(p.y)]

out = {
    'W': W, 'H': H,
    'SOON': path(soon), 'SERVED': path(unary_union(list(served.values()))),
    'LINES': lines(linemerge(unary_union([g.boundary for g in zips.values()]))),
    'EDGE': lines(unary_union(list(served.values())).boundary, 1.0),
    'V_LABEL': [round(ver.representative_point().x), round(ver.representative_point().y)],
    'B': path(unary_union([served['85326'], served['85396']])), 'G': path(unary_union([served['85338'], served['85395']])),
    'L': path(served['85340']), 'CP': path(served['85355']), 'V': path(ver, 0.8),
    'OUTLINE': lines(everything.boundary, 2.0),
    'zip_label': {z: label_at(g) for z, g in served.items()},
    'count': len(zips),
}
CITIES = [('Phoenix', 33.4484, -112.0740), ('Scottsdale', 33.4942, -111.9261), ('Tempe', 33.4255, -111.9400), ('Mesa', 33.4152, -111.8315),
          ('Chandler', 33.3062, -111.8413), ('Gilbert', 33.3528, -111.7890), ('Glendale', 33.5387, -112.1860), ('Peoria', 33.5806, -112.2374),
          ('Surprise', 33.6292, -112.3680), ('Avondale', 33.4356, -112.3496), ('Laveen', 33.3628, -112.1693), ('Queen Creek', 33.2487, -111.6343),
          ('Sun City', 33.5975, -112.2718), ('Fountain Hills', 33.6117, -111.7174), ('Paradise Valley', 33.5312, -111.9426)]
out['cities'] = [[n] + [round(v) for v in proj(lon, lat)] for n, lat, lon in CITIES]
json.dump(out, open('/home/claude/build/v2/valleydata.json', 'w'))
print('zips', len(zips), 'size', sum(len(v) for v in out.values() if isinstance(v, str)), 'W H', W, H)
print('served labels', out['zip_label'])

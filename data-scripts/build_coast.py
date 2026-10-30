import json, math
from shapely.geometry import LineString, Polygon, Point, MultiLineString, box
from shapely.ops import unary_union, linemerge
LAT0, LON0 = -33.95, 151.25
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110540.0
P  = lambda lat, lon: ((lon - LON0) * KX, (lat - LAT0) * KY)
UP = lambda x, y: (LAT0 + y / KY, LON0 + x / KX)
LIMIT = 2 * 1852.0          # 2 NM
WARN  = LIMIT - 500.0       # warn 500 m inside the limit
LAT_MIN, LAT_MAX = -34.035, -33.825   # mapped range: Cape Baily → South Head

d = json.load(open('features.json'))
coast, outcrops = [], []
for w in d['ways']:
    nat = w['tags'].get('natural')
    pts = [P(*p) for p in w['pts']]
    if len(pts) < 2: continue
    if nat == 'coastline':
        coast.append(LineString(pts))
    elif nat in ('bare_rock', 'rock', 'reef', 'shoal'):
        g = Polygon(pts) if len(pts) >= 4 and pts[0] == pts[-1] else LineString(pts)
        outcrops.append(g.buffer(0) if g.geom_type == 'Polygon' else g)
for p in d['points']:
    outcrops.append(Point(P(p['lat'], p['lon'])))

merged = linemerge(coast)
lines = list(merged.geoms) if merged.geom_type == 'MultiLineString' else [merged]
lines.sort(key=lambda l: -l.length)
main = lines[0]
print('coast pieces', len(lines), 'main length km', round(main.length / 1000, 1),
      'ends', UP(*main.coords[0]), UP(*main.coords[-1]))

land = unary_union(coast + outcrops)

# Seaward test: OSM coastline has land on the LEFT, water on the RIGHT.
# For a point, find the nearest coastline segment and check which side it's on.
segs = []
for l in coast:
    cc = list(l.coords)
    segs += list(zip(cc, cc[1:]))
import numpy as np
A = np.array([s[0] for s in segs]); B = np.array([s[1] for s in segs])
def is_sea(x, y):
    p = np.array([x, y]); ab = B - A
    t = np.clip(((p - A) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-9), 0, 1)
    proj = A + ab * t[:, None]
    i = int(np.argmin(((proj - p) ** 2).sum(1)))
    cross = ab[i, 0] * (y - A[i, 1]) - ab[i, 1] * (x - A[i, 0])
    return cross < 0   # right-hand side = water
print('sea test', is_sea(*P(-33.95, 151.32)), is_sea(*P(-33.92, 151.24)), is_sea(*P(-34.03, 151.26)))
for i, l in enumerate(lines):
    print('piece', i, round(l.length), UP(*l.coords[0]), UP(*l.coords[-1]))

def contour(dist):
    # Window starts east of the Botany Bay heads: the bay is all within 2 NM of
    # shore, and its inner shoreline isn't in the downloaded data.
    win = box(*P(LAT_MIN, 151.235), *P(LAT_MAX, 151.45))
    seg = land.buffer(dist, resolution=24).boundary.intersection(win)
    res = []
    for g in (seg.geoms if hasattr(seg, 'geoms') else [seg]):
        if g.geom_type != 'LineString': continue
        lons = [UP(x, y)[1] for x, y in g.coords]
        # Inland pieces run into the western window edge; the seaward line doesn't
        if min(lons) < 151.2355 or max(lons) < 151.30: continue
        res.append([[round(v, 5) for v in UP(x, y)] for x, y in g.simplify(8).coords])
    return res

limit_lines = contour(LIMIT)
warn_lines = contour(WARN)
print('limit pieces', len(limit_lines), [len(l) for l in limit_lines], 'warn pieces', len(warn_lines))

# Geometry for runtime distance checks, simplified to 4 m, kept near the mapped range
near = box(*P(LAT_MIN - 0.05, 151.10), *P(LAT_MAX + 0.05, 151.45))
def to_ll(g):
    g = g.simplify(4)
    if g.geom_type == 'Point': return [[round(v, 6) for v in UP(g.x, g.y)]]
    if g.geom_type == 'Polygon': g = g.exterior
    return [[round(v, 6) for v in UP(x, y)] for x, y in g.coords]
features = []
for g in coast + outcrops:
    gi = g.intersection(near)
    if gi.is_empty: continue
    for part in (gi.geoms if hasattr(gi, 'geoms') else [gi]):
        features.append(to_ll(part))
print('runtime features', len(features), 'points', sum(len(f) for f in features))

# Main coast for the map, simplified more
map_coast = [[[round(v, 5) for v in UP(x, y)] for x, y in l.simplify(12).coords] for l in lines if l.length > 300]
islands = [to_ll(g) for g in outcrops if g.geom_type != 'Point' and g.area > 1500] if True else []

js = f"""/* ── Surf Patrol Log – coast.js (generated) ──
   Coastline, islands, rock platforms and reefs from South Head to Cape Baily,
   and the pre-computed 2 NM line measured from the outermost land or outcrop.
   Data © OpenStreetMap contributors (ODbL), downloaded Oct 2026.
   Regenerate with data-scripts/fetch_coast.py then build_coast.py.
   This is an aid only — the vessel's plotter is the authority.
*/
const COAST = {{
  mapped: {{ latMin: {LAT_MIN}, latMax: {LAT_MAX} }},
  limitM: {LIMIT},
  warnM: {WARN},
  features: {json.dumps(features, separators=(',', ':'))},
  mapCoast: {json.dumps(map_coast, separators=(',', ':'))},
  mapOutcrops: {json.dumps(islands, separators=(',', ':'))},
  limitLines: {json.dumps(limit_lines, separators=(',', ':'))},
  warnLines: {json.dumps(warn_lines, separators=(',', ':'))}
}};
"""
open('../coast.js', 'w').write(js)
print('coast.js KB', round(len(js) / 1024))

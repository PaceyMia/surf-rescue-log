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

# ── Navigable-water grid for the route calculator ─────────────────────
# Cells at least CLEAR_M from any land/outcrop and connected to open sea.
import numpy as np, shapely
from collections import deque
CLEAR_M = 100.0
CELL_M = 75.0
G_LAT_MIN, G_LAT_MAX, G_LON_MIN, G_LON_MAX = -34.045, -33.82, 151.215, 151.36
x0, y0 = P(G_LAT_MIN, G_LON_MIN)
x1, y1 = P(G_LAT_MAX, G_LON_MAX)
cols = int((x1 - x0) // CELL_M) + 1
rows = int((y1 - y0) // CELL_M) + 1
blocked = shapely.prepared.prep(land.buffer(CLEAR_M, resolution=8))
xs = x0 + (np.arange(cols) + 0.5) * CELL_M
ys = y0 + (np.arange(rows) + 0.5) * CELL_M
XX, YY = np.meshgrid(xs, ys)
free = ~shapely.contains_xy(land.buffer(CLEAR_M, resolution=8), XX, YY)
# The harbour and Botany Bay shores aren't in the data, so a flood fill alone
# would leak inland. Also require each cell to be on the water side of its
# nearest coastline segment (OSM coastlines keep land on the left).
from scipy.spatial import cKDTree
SA, SB, WAY = [], [], []
for wi, l in enumerate(coast):
    c = list(l.coords)
    for a_, b_ in zip(c, c[1:]):
        SA.append(a_); SB.append(b_); WAY.append(wi)
SA = np.array(SA); SB = np.array(SB); WAY = np.array(WAY)
tree = cKDTree((SA + SB) / 2)
pts = np.column_stack([XX.ravel(), YY.ravel()])
_, idx = tree.query(pts, k=16)
best_d = np.full(len(pts), np.inf); best_i = np.zeros(len(pts), dtype=int); best_t = np.zeros(len(pts))
for k in range(idx.shape[1]):
    i = idx[:, k]; a_ = SA[i]; ab = SB[i] - a_
    t = np.clip(((pts - a_) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-9), 0, 1)
    d = (((a_ + ab * t[:, None]) - pts) ** 2).sum(1)
    better = d < best_d; best_d[better] = d[better]; best_i[better] = i[better]; best_t[better] = t[better]
def water_normal(i):  # right-hand normal of segment i (water side)
    ab = SB[i] - SA[i]
    return np.column_stack([ab[:, 1], -ab[:, 0]])
n = water_normal(best_i)
# At a vertex, add the neighbouring segment's normal (pseudo-normal); a
# dangling way end has no neighbour, so it's treated as water.
nxt = np.minimum(best_i + 1, len(SA) - 1); prv = np.maximum(best_i - 1, 0)
at_end = best_t >= 1 - 1e-9; at_start = best_t <= 1e-9
has_next = at_end & (WAY[nxt] == WAY[best_i]) & (nxt != best_i)
has_prev = at_start & (WAY[prv] == WAY[best_i]) & (prv != best_i)
unit = lambda v: v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
n = unit(n)
n = np.where(has_next[:, None], n + unit(water_normal(nxt)), n)
n = np.where(has_prev[:, None], n + unit(water_normal(prv)), n)
vertex = np.where(at_end[:, None], SB[best_i], np.where(at_start[:, None], SA[best_i], SA[best_i] + (SB[best_i] - SA[best_i]) * best_t[:, None]))
side = ((pts - vertex) * n).sum(1)
dangling = (at_end & ~has_next) | (at_start & ~has_prev)
is_water = (side > 0) | dangling
free &= is_water.reshape(free.shape)
# Flood fill from the open sea (east edge) so land interiors aren't "water"
sea = np.zeros_like(free)
q = deque((r, cols - 1) for r in range(rows) if free[r, cols - 1])
for r, c in q: sea[r, c] = True
while q:
    r, c = q.popleft()
    for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < rows and 0 <= cc < cols and free[rr, cc] and not sea[rr, cc]:
            sea[rr, cc] = True; q.append((rr, cc))
def rle(row):
    runs, cur, n = [], False, 0
    for v in row:
        if bool(v) == cur: n += 1
        else: runs.append(n); cur = not cur; n = 1
    runs.append(n)
    return ','.join(map(str, runs))
nav_rows = [rle(sea[r]) for r in range(rows)]
print('nav grid', rows, 'x', cols, 'water cells', int(sea.sum()))

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
  warnLines: {json.dumps(warn_lines, separators=(',', ':'))},
  // Navigable water for routing: rows south→north, run lengths alternating blocked/water
  nav: {{ origin: {json.dumps([round(UP(x0, y0)[0], 6), round(UP(x0, y0)[1], 6)])}, cellM: {CELL_M}, rows: {rows}, cols: {cols},
         proj: {{ lat0: {LAT0}, lon0: {LON0}, kx: {KX:.4f}, ky: {KY} }}, data: {json.dumps(nav_rows, separators=(',', ':'))} }}
}};
"""
open('../coast.js', 'w').write(js)
print('coast.js KB', round(len(js) / 1024))

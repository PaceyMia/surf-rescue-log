"""Fit tidal harmonic constituents for Fort Denison (Sydney Harbour) from the
University of Hawaii Sea Level Center hourly record (station 333, GMT, mm
above chart datum), and write tide-constants.js for the app.

    python3 data-scripts/fit_tides.py h333.csv tide-constants.js

Data: https://uhslc.soest.hawaii.edu/data/csv/fast/hourly/h333.csv
Method: least squares on the last 3 years with nodal (18.6-year) corrections,
the standard harmonic method used for official tide tables. Re-run yearly.
"""
import csv, json, math, sys
from datetime import datetime, timezone, timedelta
import numpy as np

SPEEDS = {  # degrees per hour
    'M2': 28.9841042, 'S2': 30.0, 'N2': 28.4397295, 'K2': 30.0821373, 'K1': 15.0410686, 'O1': 13.9430356,
    'P1': 14.9589314, 'Q1': 13.3986609, '2N2': 27.8953548, 'MU2': 27.9682084, 'NU2': 28.5125831, 'L2': 29.5284789,
    'T2': 29.9589333, 'LAM2': 29.4556253, 'J1': 15.5854433, 'OO1': 16.1391017, '2Q1': 12.8542862, 'RHO1': 13.4715145,
    'M4': 57.9682084, 'MS4': 58.9841042, 'MN4': 57.4238337, 'M3': 43.4761563, 'M6': 86.9523127,
    'SA': 0.0410686, 'SSA': 0.0821373, 'MSF': 1.0158958, 'MM': 0.5443747,
}
EPOCH = datetime(2026, 1, 1, tzinfo=timezone.utc)

def node_deg(t_hours):
    # Longitude of the Moon's ascending node
    d = (EPOCH + timedelta(hours=float(t_hours)) - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400
    return 125.04452 - 0.0529539 * d

def nodal(name, N):
    c, s = math.cos(math.radians(N)), math.sin(math.radians(N))
    m2 = (1 - 0.037 * c, -2.1 * s)
    o1 = (1.009 + 0.187 * c, 10.8 * s)
    table = {
        'M2': m2, 'N2': m2, '2N2': m2, 'MU2': m2, 'NU2': m2, 'LAM2': m2, 'L2': m2,
        'K2': (1.024 + 0.286 * c, -17.7 * s), 'K1': (1.006 + 0.115 * c, -8.9 * s),
        'O1': o1, 'Q1': o1, '2Q1': o1, 'RHO1': o1,
        'J1': (1.013 + 0.168 * c, -12.9 * s), 'OO1': (1.110 + 0.450 * c, -36.7 * s),
        'M4': (m2[0] ** 2, 2 * m2[1]), 'MN4': (m2[0] ** 2, 2 * m2[1]), 'MS4': m2,
        'M3': (m2[0] ** 1.5, 1.5 * m2[1]), 'M6': (m2[0] ** 3, 3 * m2[1]),
        'MM': (1 - 0.130 * c, 0.0), 'MSF': m2,
    }
    return table.get(name, (1.0, 0.0))

def design(t, names):
    N = node_deg(t.mean())  # node moves slowly; per-row values below
    cols = []
    Ns = np.array([node_deg(x) for x in t[::24]]).repeat(24)[:len(t)]
    for n in names:
        w = math.radians(SPEEDS[n])
        f = np.array([nodal(n, x)[0] for x in Ns]); u = np.radians([nodal(n, x)[1] for x in Ns])
        cols += [f * np.cos(w * t + u), f * np.sin(w * t + u)]
    return np.column_stack(cols + [np.ones_like(t)])

def load(path):
    t, h = [], []
    for y, m, d, hr, v in csv.reader(open(path)):
        v = int(v)
        if v < -9000: continue
        dt = datetime(int(y), int(m), int(d), tzinfo=timezone.utc) + timedelta(hours=int(hr) - 1 if int(hr) == 24 else int(hr))
        t.append((dt - EPOCH).total_seconds() / 3600); h.append(v / 1000)
    return np.array(t), np.array(h)

t, h = load(sys.argv[1])
end = t.max()
names = list(SPEEDS)
train = (t > end - 3 * 8766 - 2190) & (t <= end - 2190)
test = t > end - 2190
x, *_ = np.linalg.lstsq(design(t[train], names), h[train], rcond=None)

def predict(tt):
    return design(tt, names) @ x

# Check against the held-back 3 months: residual RMS and high/low time errors
res = h[test] - predict(t[test])
def extremes(tt, yy):
    i = np.where((yy[1:-1] > yy[:-2]) & (yy[1:-1] > yy[2:]) | (yy[1:-1] < yy[:-2]) & (yy[1:-1] < yy[2:]))[0] + 1
    return tt[i], yy[i]
fine = np.arange(t[test][0], t[test][-1], 0.05)
pt, ph = extremes(fine, predict(fine))
# smooth observations (hourly) with a parabola through each turning point
ot, oh = [], []
tt, yy = t[test], h[test]
for i in range(1, len(yy) - 1):
    a, b, c = yy[i - 1:i + 2]
    if (b > a and b > c) or (b < a and b < c):
        den = a - 2 * b + c
        ot.append(tt[i] + (0.5 * (a - c) / den if den else 0))
ot = np.array(ot)
errs = [min(abs(ot - p)) * 60 for p in pt if min(abs(ot - p)) < 2]
print(f'held-back months: residual RMS {res.std()*100:.1f} cm; turning-point time error median {np.median(errs):.0f} min, 90% within {np.percentile(errs, 90):.0f} min ({len(errs)} turns)')

consts = [{'name': n, 'speed': SPEEDS[n], 'a': round(float(x[2 * i]), 5), 'b': round(float(x[2 * i + 1]), 5)} for i, n in enumerate(names)]
mean = round(float(x[-1]), 4)
amp = {c['name']: round(math.hypot(c['a'], c['b']), 3) for c in consts}
print('mean level', mean, 'm; M2', amp['M2'], 'S2', amp['S2'], 'K1', amp['K1'], 'O1', amp['O1'])
js = f"""/* ── Surf Patrol Log – tide-constants.js (generated) ──
   Fort Denison (Sydney Harbour) tidal constituents, fitted by
   data-scripts/fit_tides.py to the UHSLC hourly record (station 333) up to
   {(EPOCH + timedelta(hours=float(end))).date()}. Heights in metres above chart datum, time in hours
   from 2026-01-01 00:00 UTC. h(t) = mean + Σ f·(a·cos(ωt+u) + b·sin(ωt+u)).
   Sea level data: University of Hawaii Sea Level Center / Bureau of Meteorology.
*/
const TIDE_CONSTANTS = {{
  station: 'Fort Denison',
  epoch: '2026-01-01T00:00:00Z',
  mean: {mean},
  constituents: {json.dumps(consts, separators=(',', ':'))}
}};
"""
open(sys.argv[2], 'w').write(js)
print('wrote', sys.argv[2])

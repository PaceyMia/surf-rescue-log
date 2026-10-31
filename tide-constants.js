/* ── Surf Patrol Log – tide-constants.js (generated) ──
   Fort Denison (Sydney Harbour) tidal constituents, fitted by
   data-scripts/fit_tides.py to the UHSLC hourly record (station 333) up to
   2026-08-31. Heights in metres above chart datum, time in hours
   from 2026-01-01 00:00 UTC. h(t) = mean + Σ f·(a·cos(ωt+u) + b·sin(ωt+u)).
   Sea level data: University of Hawaii Sea Level Center / Bureau of Meteorology.
*/
const TIDE_CONSTANTS = {
  station: 'Fort Denison',
  epoch: '2026-01-01T00:00:00Z',
  mean: 1.053,
  constituents: [{"name":"M2","speed":28.9841042,"a":-0.23167,"b":-0.446},{"name":"S2","speed":30.0,"a":0.09672,"b":-0.07833},{"name":"N2","speed":28.4397295,"a":-0.0591,"b":-0.09453},{"name":"K2","speed":30.0821373,"a":-0.0119,"b":0.03616},{"name":"K1","speed":15.0410686,"a":0.11228,"b":-0.09725},{"name":"O1","speed":13.9430356,"a":-0.03942,"b":-0.0873},{"name":"P1","speed":14.9589314,"a":0.04058,"b":-0.01695},{"name":"Q1","speed":13.3986609,"a":-0.01209,"b":-0.01899},{"name":"2N2","speed":27.8953548,"a":-0.01343,"b":-0.01503},{"name":"MU2","speed":27.9682084,"a":-0.02007,"b":0.00617},{"name":"NU2","speed":28.5125831,"a":-0.02042,"b":0.00639},{"name":"L2","speed":29.5284789,"a":0.01307,"b":0.01023},{"name":"T2","speed":29.9589333,"a":0.0072,"b":-0.00304},{"name":"LAM2","speed":29.4556253,"a":-0.00304,"b":0.00524},{"name":"J1","speed":15.5854433,"a":0.00802,"b":-0.00471},{"name":"OO1","speed":16.1391017,"a":-0.00443,"b":-0.00597},{"name":"2Q1","speed":12.8542862,"a":-0.00301,"b":-0.0025},{"name":"RHO1","speed":13.4715145,"a":-0.00421,"b":0.00233},{"name":"M4","speed":57.9682084,"a":-0.00156,"b":0.00277},{"name":"MS4","speed":58.9841042,"a":-0.00086,"b":-0.0014},{"name":"MN4","speed":57.4238337,"a":-0.00042,"b":0.00102},{"name":"M3","speed":43.4761563,"a":-0.0021,"b":0.00086},{"name":"M6","speed":86.9523127,"a":0.00112,"b":0.00166},{"name":"SA","speed":0.0410686,"a":-0.02751,"b":0.01454},{"name":"SSA","speed":0.0821373,"a":0.02337,"b":-0.03211},{"name":"MSF","speed":1.0158958,"a":-0.00956,"b":-0.00118},{"name":"MM","speed":0.5443747,"a":-0.01292,"b":0.00134}]
};

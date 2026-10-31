/* ── Surf Patrol Log – tide.js ──
   Tide predictions for Fort Denison from the harmonic constants in
   tide-constants.js (fitted to the measured record; checks out to a median
   3 minutes on high/low times). Works offline. Botany Bay and the open
   coast turn within a few minutes of Fort Denison.
*/
const Tide = (() => {
  const C = TIDE_CONSTANTS;
  const epoch = Date.parse(C.epoch);
  const rad = d => d * Math.PI / 180;

  // Longitude of the Moon's ascending node (18.6-year cycle), degrees
  const node = ms => 125.04452 - 0.0529539 * ((ms - Date.UTC(2000, 0, 1, 12)) / 86400000);

  // Nodal amplitude factor f and phase u (degrees) for each constituent
  function nodal(name, N) {
    const c = Math.cos(rad(N)), s = Math.sin(rad(N));
    const m2 = [1 - 0.037 * c, -2.1 * s];
    const o1 = [1.009 + 0.187 * c, 10.8 * s];
    switch (name) {
      case 'M2': case 'N2': case '2N2': case 'MU2': case 'NU2': case 'LAM2': case 'L2': case 'MS4': case 'MSF': return m2;
      case 'K2': return [1.024 + 0.286 * c, -17.7 * s];
      case 'K1': return [1.006 + 0.115 * c, -8.9 * s];
      case 'O1': case 'Q1': case '2Q1': case 'RHO1': return o1;
      case 'J1': return [1.013 + 0.168 * c, -12.9 * s];
      case 'OO1': return [1.110 + 0.450 * c, -36.7 * s];
      case 'M4': case 'MN4': return [m2[0] ** 2, 2 * m2[1]];
      case 'M3': return [m2[0] ** 1.5, 1.5 * m2[1]];
      case 'M6': return [m2[0] ** 3, 3 * m2[1]];
      case 'MM': return [1 - 0.130 * c, 0];
      default: return [1, 0];
    }
  }

  // Height in metres above chart datum at a time (ms)
  function height(ms) {
    const t = (ms - epoch) / 3600000;
    const N = node(ms);
    let h = C.mean;
    for (const k of C.constituents) {
      const [f, u] = nodal(k.name, N);
      const arg = rad(k.speed * t + u);
      h += f * (k.a * Math.cos(arg) + k.b * Math.sin(arg));
    }
    return h;
  }

  // Highs and lows between two times, to the minute
  function turns(fromMs, toMs) {
    const step = 6 * 60000;
    const out = [];
    let a = height(fromMs - step), b = height(fromMs);
    for (let ms = fromMs; ms <= toMs; ms += step) {
      const c = height(ms + step);
      if ((b > a && b >= c) || (b < a && b <= c)) {
        const den = a - 2 * b + c;
        const off = den ? 0.5 * (a - c) / den : 0; // parabola through the three points
        const at = ms + off * step;
        out.push({ at: new Date(Math.round(at / 60000) * 60000), type: b > a ? 'high' : 'low', height: height(at) });
      }
      a = b; b = c;
    }
    return out;
  }

  return { height, turns };
})();

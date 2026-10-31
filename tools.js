/* ── Surf Patrol Log – tools.js ──
   Tools tab: speed/distance/time and fuel range.
   Defaults are nautical: knots, nautical miles, hours and minutes.
*/
(() => {
  const $ = id => document.getElementById(id);
  const num = input => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const KM_PER_NM = 1.852;

  // ── Speed · Distance · Time ───────────────────────────────────────
  const speed = $('sdt-speed'), speedUnit = $('sdt-speed-unit');
  const dist  = $('sdt-dist'),  distUnit  = $('sdt-dist-unit');
  const hrs   = $('sdt-hrs'),   mins      = $('sdt-min');
  const sdtResult = $('sdt-result');

  // Which fields the user typed in (the third is the calculated one)
  let lastEdited = [];

  const toKn = v => speedUnit.value === 'kmh' ? v / KM_PER_NM : v;
  const fromKn = v => speedUnit.value === 'kmh' ? v * KM_PER_NM : v;
  const toNm = v => distUnit.value === 'km' ? v / KM_PER_NM : v;
  const fromNm = v => distUnit.value === 'km' ? v * KM_PER_NM : v;
  const sUnit = () => speedUnit.value === 'kmh' ? 'km/h' : 'kn';
  const dUnit = () => distUnit.value === 'km' ? 'km' : 'NM';

  function timeHours() {
    const h = num(hrs), m = num(mins);
    if (h == null && m == null) return null;
    return (h || 0) + (m || 0) / 60;
  }

  function fmtDuration(h) {
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60), mm = total % 60;
    return hh ? `${hh} h ${mm} min` : `${mm} min`;
  }

  function eta(h) {
    const t = new Date(Date.now() + h * 3600000);
    return t.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function calcSdt() {
    const s = num(speed), d = num(dist), t = timeHours();
    const have = { speed: s != null, dist: d != null, time: t != null };
    // Solve for whichever field the user didn't touch most recently
    const filled = Object.keys(have).filter(k => have[k]);
    let solveFor = null;
    if (filled.length === 2) solveFor = ['speed', 'dist', 'time'].find(k => !have[k]);
    else if (filled.length === 3) solveFor = ['speed', 'dist', 'time'].find(k => !lastEdited.slice(-2).includes(k));

    if (!solveFor) { sdtResult.textContent = ''; return; }

    if (solveFor === 'time') {
      if (!s) { sdtResult.textContent = 'Speed must be more than 0.'; return; }
      const h = toNm(d) / toKn(s);
      sdtResult.textContent = `Time: ${fmtDuration(h)} · ETA if leaving now ${eta(h)}`;
    } else if (solveFor === 'dist') {
      const nm = toKn(s) * t;
      sdtResult.textContent = `Distance: ${fromNm(nm).toFixed(2)} ${dUnit()}`;
    } else {
      if (!t) { sdtResult.textContent = 'Time must be more than 0.'; return; }
      const kn = toNm(d) / t;
      sdtResult.textContent = `Speed: ${fromKn(kn).toFixed(1)} ${sUnit()}`;
    }
  }

  [[speed, 'speed'], [dist, 'dist'], [hrs, 'time'], [mins, 'time']].forEach(([input, key]) => {
    input.addEventListener('input', () => {
      lastEdited = lastEdited.filter(k => k !== key).concat(key);
      calcSdt();
    });
  });
  [speedUnit, distUnit].forEach(sel => sel.addEventListener('change', calcSdt));
  $('sdt-clear').addEventListener('click', () => {
    [speed, dist, hrs, mins].forEach(i => { i.value = ''; });
    lastEdited = [];
    sdtResult.textContent = '';
  });

  // ── Fuel & range (rule of thirds) ─────────────────────────────────
  const FUEL_KEY = 'surfPatrolFuel';
  const onboard = $('fuel-onboard'), burn = $('fuel-burn'), cruise = $('fuel-speed');
  const fuelResult = $('fuel-result');

  try {
    const saved = JSON.parse(localStorage.getItem(FUEL_KEY)) || {};
    if (saved.burn) burn.value = saved.burn;
    if (saved.cruise) cruise.value = saved.cruise;
  } catch { /* nothing saved */ }

  function calcFuel() {
    const litres = num(onboard) ?? 450;
    const lph = num(burn), kn = num(cruise);
    try { localStorage.setItem(FUEL_KEY, JSON.stringify({ burn: burn.value, cruise: cruise.value })); } catch { /* full */ }
    if (!lph) { fuelResult.textContent = 'Enter the burn rate to calculate endurance.'; return; }
    if (litres > 450) { fuelResult.textContent = 'More than the 450 L tank — check the figure.'; return; }
    const hours = litres / lph;
    const outHours = hours / 3;
    let text = `Endurance ${fmtDuration(hours)} total · ${fmtDuration(outHours)} out before turning back (⅓ rule)`;
    if (kn) text += ` · Radius ${(outHours * kn).toFixed(1)} NM at ${kn} kn`;
    fuelResult.textContent = text;
  }
  [onboard, burn, cruise].forEach(i => i.addEventListener('input', calcFuel));
  calcFuel();
})();

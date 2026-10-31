/* ── Surf Patrol Log – route.js ──
   Job route: distance and courses by water between two points, going around
   headlands, islands and rock platforms (keeps ≥50 m off land). Uses the
   navigable-water grid in coast.js (Figure Eight Pools → Manly, incl. the
   harbour's eastern bays, Botany Bay/Georges River and Port Hacking)
   and A* path-finding, then straightens the path into a few legs.
   An aid for planning — the plotter is the authority.
*/
(() => {
  const ROUTE_KEY = 'surfPatrolRoute';
  const NM = 1852;
  const nav = COAST.nav;
  const { lat0, lon0, kx, ky } = nav.proj;

  // ── Grid ──────────────────────────────────────────────────────────
  // 0 land, 1 open water, 2 within 200 m of land, 3 within 100 m, 4 charted channel
  const water = new Uint8Array(nav.rows * nav.cols);
  nav.data.forEach((row, r) => {
    let c = 0;
    row.split(',').forEach(run => {
      const [v, n] = run.split('x').map(Number);
      if (v) water.fill(v, r * nav.cols + c, r * nav.cols + c + n);
      c += n;
    });
  });
  // No depth data, so stay mid-channel: water near shore costs more, charted
  // fairways/recommended tracks cost less
  const COST = [Infinity, 1, 1.25, 1.8, 0.7];
  const ox = (nav.origin[1] - lon0) * kx;
  const oy = (nav.origin[0] - lat0) * ky;
  const toXY = (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
  const toLL = (x, y) => [lat0 + y / ky, lon0 + x / kx];
  const cellOf = (lat, lon) => {
    const [x, y] = toXY(lat, lon);
    return [Math.floor((y - oy) / nav.cellM), Math.floor((x - ox) / nav.cellM)];
  };
  const centre = (r, c) => [ox + (c + 0.5) * nav.cellM, oy + (r + 0.5) * nav.cellM];
  const inGrid = (r, c) => r >= 0 && r < nav.rows && c >= 0 && c < nav.cols;
  const isWater = (r, c) => inGrid(r, c) && water[r * nav.cols + c] > 0;

  // Nearest water cell (a beach or headland position is on land)
  function snap(lat, lon) {
    const [r0, c0] = cellOf(lat, lon);
    if (isWater(r0, c0)) return [r0, c0];
    for (let rad = 1; rad <= 60; rad++) {
      let best = null, bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (isWater(r0 + dr, c0 + dc) && dr * dr + dc * dc < bestD) { best = [r0 + dr, c0 + dc]; bestD = dr * dr + dc * dc; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // ── A* over 8-connected water cells ───────────────────────────────
  function astar(start, goal) {
    const N = nav.rows * nav.cols;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const idx = (r, c) => r * nav.cols + c;
    const h = (r, c) => Math.hypot(r - goal[0], c - goal[1]) * COST[4]; // admissible with the cheapest cost
    const heap = []; // [f, index]
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const s = idx(...start), t = idx(...goal);
    g[s] = 0;
    push(h(...start), s);
    const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const [, cur] = pop();
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const r = Math.floor(cur / nav.cols), c = cur % nav.cols;
      for (const [dr, dc, cost] of STEPS) {
        const rr = r + dr, cc = c + dc;
        if (!isWater(rr, cc)) continue;
        // Don't cut diagonally past a land corner
        if (dr && dc && (!isWater(r + dr, c) || !isWater(r, c + dc))) continue;
        const ni = idx(rr, cc);
        const ng = g[cur] + cost * COST[water[ni]];
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ng + h(rr, cc), ni); }
      }
    }
    if (g[t] === Infinity) return null;
    const path = [];
    for (let i = t; i !== -1; i = came[i]) path.push([Math.floor(i / nav.cols), i % nav.cols]);
    return path.reverse();
  }

  // Straight line of water cells between two cells?
  // Straight line between two cells that never gets closer to shore than the
  // path it replaces (so straightening doesn't undo the mid-channel routing)
  function lineOfSight(a, b, worst) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let i = 1; i < steps; i++) {
      const r = Math.round(a[0] + (b[0] - a[0]) * i / steps), c = Math.round(a[1] + (b[1] - a[1]) * i / steps);
      if (!isWater(r, c)) return false;
      const v = water[r * nav.cols + c];
      if (v !== 4 && v > worst) return false;
    }
    return true;
  }

  // Pull the cell path tight into as few straight legs as possible
  function straighten(path) {
    const out = [path[0]];
    let anchor = 0;
    while (anchor < path.length - 1) {
      // Scan forward, tracking the closest-to-shore class seen so far; stop
      // once the straight line has failed for a while
      let far = anchor + 1, worst = 1, misses = 0;
      const at = k => water[path[k][0] * nav.cols + path[k][1]];
      if (at(anchor) !== 4) worst = Math.max(worst, at(anchor));
      for (let j = anchor + 1; j < path.length && misses < 40; j++) {
        const v = at(j);
        if (v !== 4 && v > worst) worst = v;
        if (lineOfSight(path[anchor], path[j], worst)) { far = j; misses = 0; } else misses++;
      }
      out.push(path[far]);
      anchor = far;
    }
    return out;
  }

  function route(from, to) {
    const a = snap(from.lat, from.lon), b = snap(to.lat, to.lon);
    if (!a || !b) return null;
    const cells = astar(a, b);
    if (!cells) return null;
    const legsCells = straighten(cells);
    const pts = legsCells.map(([r, c]) => toLL(...centre(r, c)));
    const legs = [];
    let metres = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = toXY(...pts[i]), [x2, y2] = toXY(...pts[i + 1]);
      const m = Math.hypot(x2 - x1, y2 - y1);
      if (m < 1) continue;
      metres += m;
      legs.push({ nm: m / NM, brg: bearingDeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) });
    }
    // Straight line between the same water points the route uses (a place's map
    // point can be on land, e.g. a bridge or the middle of a beach)
    const [sa, sb] = [pts[0], pts[pts.length - 1]];
    return { pts, legs, nm: metres / NM, straightNm: distanceNm(sa[0], sa[1], sb[0], sb[1]) };
  }

  // ── UI ────────────────────────────────────────────────────────────
  const fromSel = document.getElementById('route-from');
  const toSel = document.getElementById('route-to');
  const speedIn = document.getElementById('route-speed');
  const result = document.getElementById('route-result');
  const svg = document.getElementById('route-map');

  // Named beaches, bays and points from Figure Eight Pools to Manly, the
  // harbour's eastern bays, Botany Bay/Georges River and Port Hacking
  const places = COAST.routePlaces;
  const placeById = new Map(places.map((p, i) => [String(i), p]));
  const option = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
  const groups = () => COAST.routeRegions.map(region => {
    const g = document.createElement('optgroup');
    g.label = region;
    places.forEach((p, i) => { if (p.region === region) g.append(option(String(i), p.name)); });
    return g;
  }).filter(g => g.children.length);
  fromSel.append(option('gps', '📍 Current GPS position'), ...groups());
  toSel.append(option('', 'Choose job location…'), ...groups());
  const findPlace = value => placeById.get(value);

  try {
    const saved = JSON.parse(localStorage.getItem(ROUTE_KEY)) || {};
    if (saved.from && (saved.from === 'gps' || placeById.has(saved.from))) fromSel.value = saved.from;
    if (saved.speed) speedIn.value = saved.speed;
  } catch { /* nothing saved */ }

  // ── Searchable From / To pickers ──────────────────────────────────
  // The hidden <select>s keep the chosen value; the search box filters the
  // places as you type, grouped by area.
  function makePicker(sel, input, list, includeGps) {
    const label = v => v === 'gps' ? '📍 Current GPS position' : (placeById.get(v)?.name || '');
    const syncInput = () => { input.value = label(sel.value); };
    const open = on => { list.hidden = !on; input.setAttribute('aria-expanded', String(on)); };
    const choose = value => {
      sel.value = value;
      syncInput();
      open(false);
      input.blur();
      sel.dispatchEvent(new Event('change'));
    };
    const item = (value, text) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.value = value;
      li.textContent = text;
      // pointerdown so the choice lands before the search box loses focus
      li.addEventListener('pointerdown', e => { e.preventDefault(); choose(value); });
      li.addEventListener('click', () => choose(value));
      return li;
    };
    function render(query) {
      const q = query.trim().toLowerCase();
      list.replaceChildren();
      if (includeGps && (!q || 'current gps position'.includes(q))) list.append(item('gps', '📍 Current GPS position'));
      COAST.routeRegions.forEach(region => {
        const matches = places.map((p, i) => [p, i])
          .filter(([p]) => p.region === region && (!q || p.name.toLowerCase().includes(q) || region.toLowerCase().includes(q)));
        if (!matches.length) return;
        const head = document.createElement('li');
        head.className = 'picker-group';
        head.setAttribute('role', 'presentation');
        head.textContent = region;
        list.append(head, ...matches.map(([p, i]) => item(String(i), p.name)));
      });
      if (!list.children.length) {
        const none = document.createElement('li');
        none.className = 'picker-empty';
        none.textContent = 'No matching places';
        list.append(none);
      }
      open(true);
    }
    // A quick tap back into the box must cancel the close queued by the blur
    let closeTimer;
    input.addEventListener('focus', () => { clearTimeout(closeTimer); input.select(); render(''); });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('blur', () => { closeTimer = setTimeout(() => { open(false); syncInput(); }, 150); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const first = list.querySelector('[data-value]');
        if (first) { e.preventDefault(); choose(first.dataset.value); }
      } else if (e.key === 'Escape') {
        open(false);
        input.blur();
      }
    });
    syncInput();
  }
  makePicker(fromSel, document.getElementById('route-from-input'), document.getElementById('route-from-list'), true);
  makePicker(toSel, document.getElementById('route-to-input'), document.getElementById('route-to-list'), false);

  const pad3 = n => String(Math.round(n) % 360).padStart(3, '0');
  const fmtMins = h => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

  async function calculate() {
    try { localStorage.setItem(ROUTE_KEY, JSON.stringify({ from: fromSel.value, speed: speedIn.value })); } catch { /* storage unavailable */ }
    const to = findPlace(toSel.value);
    if (!to) { result.textContent = ''; svg.innerHTML = ''; return; }
    let from;
    if (fromSel.value === 'gps') {
      result.innerHTML = '<span class="boat-spinner small" aria-hidden="true"></span> Getting GPS fix…';
      const pos = await getPosition(15000);
      if (!pos) { result.textContent = '⚠️ GPS unavailable — pick a start place instead, or allow location access (Info tab).'; return; }
      from = { lat: pos.lat, lon: pos.lon, name: 'your position' };
    } else {
      const p = findPlace(fromSel.value);
      from = { lat: p.lat, lon: p.lon, name: p.name };
    }
    const r = route(from, to);
    const kn = parseFloat(speedIn.value);
    result.replaceChildren();
    if (!r) {
      const nm = distanceNm(from.lat, from.lon, to.lat, to.lon);
      result.textContent = `No water route found (outside the mapped area). Straight line ${nm.toFixed(1)} NM, ${pad3(bearingDeg(from.lat, from.lon, to.lat, to.lon))}°T.`;
      svg.innerHTML = '';
      return;
    }
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = `${r.nm.toFixed(1)} NM by water` + (kn > 0 ? ` · ${fmtMins(r.nm / kn)} at ${kn} kn` : '');
    // For reading out, merge legs within 20° of each other (the map keeps the exact path)
    const merged = [];
    r.legs.forEach(l => {
      const prev = merged[merged.length - 1];
      const diff = prev ? Math.abs(((l.brg - prev.brg + 540) % 360) - 180) : 999;
      if (prev && (diff < 20 || l.nm < 0.08)) {
        const total = prev.nm + l.nm;
        const x = Math.sin(prev.brg * Math.PI / 180) * prev.nm + Math.sin(l.brg * Math.PI / 180) * l.nm;
        const y = Math.cos(prev.brg * Math.PI / 180) * prev.nm + Math.cos(l.brg * Math.PI / 180) * l.nm;
        prev.brg = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
        prev.nm = total;
      } else merged.push({ ...l });
    });
    const legs = document.createElement('ol');
    legs.className = 'legs';
    merged.forEach(l => {
      const li = document.createElement('li');
      li.textContent = `Steer ${pad3(l.brg)}°T for ${l.nm.toFixed(1)} NM`;
      legs.append(li);
    });
    const extra = document.createElement('div');
    extra.className = 'muted small';
    const eta = kn > 0 ? new Date(Date.now() + r.nm / kn * 3600000).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    extra.textContent = `Straight line ${r.straightNm.toFixed(1)} NM${eta ? ` · ETA if leaving now ${eta}` : ''} · keeps 50 m off land and rocks`;
    result.append(big, legs, extra);
    draw(r, from, to);
  }

  function draw(r, from, to) {
    const all = [...r.pts, [from.lat, from.lon], [to.lat, to.lon]];
    const padLat = 0.012, padLon = 0.015;
    let latMin = Math.min(...all.map(p => p[0])) - padLat, latMax = Math.max(...all.map(p => p[0])) + padLat;
    let lonMin = Math.min(...all.map(p => p[1])) - padLon, lonMax = Math.max(...all.map(p => p[1])) + padLon;
    const W = 360;
    // Keep true proportions, at least as wide as tall-ish for readability
    let H = W * ((latMax - latMin) * ky) / ((lonMax - lonMin) * kx);
    if (H > 480) { const extraLon = ((latMax - latMin) * ky / kx) * (W / 480) - (lonMax - lonMin); lonMin -= extraLon / 2; lonMax += extraLon / 2; H = 480; }
    if (H < 200) { const extraLat = ((lonMax - lonMin) * kx / ky) * (200 / W) - (latMax - latMin); latMin -= extraLat / 2; latMax += extraLat / 2; H = 200; }
    const sx = lon => ((lon - lonMin) / (lonMax - lonMin)) * W;
    const sy = lat => ((latMax - lat) / (latMax - latMin)) * H;
    const path = line => line.map(([lat, lon], i) => `${i ? 'L' : 'M'}${sx(lon).toFixed(1)},${sy(lat).toFixed(1)}`).join('');
    let out = `<rect width="${W}" height="${H.toFixed(0)}" class="m-sea"/>`;
    COAST.mapCoast.forEach(l => { out += `<path d="${path(l)}" class="m-coast"/>`; });
    COAST.mapOutcrops.forEach(l => { out += `<path d="${path(l)}" class="m-outcrop"/>`; });
    out += `<path d="${path(r.pts)}" class="m-route"/>`;
    out += `<circle cx="${sx(from.lon)}" cy="${sy(from.lat)}" r="6" class="m-from"/>`;
    out += `<circle cx="${sx(to.lon)}" cy="${sy(to.lat)}" r="6" class="m-to"/>`;
    const label = (p, text, anchor) => `<text x="${sx(p[1]) + (anchor === 'start' ? 9 : -9)}" y="${sy(p[0]) + 4}" text-anchor="${anchor}" class="m-label m-label-big">${text}</text>`;
    out += label([from.lat, from.lon], from.name === 'your position' ? 'You' : from.name, 'end');
    out += label([to.lat, to.lon], to.name, 'end');
    svg.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(0)}`);
    svg.innerHTML = out;
  }

  [fromSel, toSel].forEach(s => s.addEventListener('change', calculate));
  speedIn.addEventListener('input', calculate);

  window.routeForTest = route;
})();

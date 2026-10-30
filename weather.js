/* ── Surf Patrol Log – weather.js ──
   Weather tab: BOM coastal waters forecast (via relay), model forecast from
   Open-Meteo (free, no key), WillyWeather tides/observations (via relay),
   and a Windy live map. Last good data is cached so a dead spot still
   shows the most recent forecast, labelled with its age.
*/
(() => {
  const WX_CACHE  = 'surfPatrolWx';
  const BOM_CACHE = 'surfPatrolBom';
  const WW_CACHE  = 'surfPatrolWw';
  const point = APP_CONFIG.forecastPoint;
  const relay = APP_CONFIG.relayUrl.replace(/\/$/, '');

  const bomBody   = document.getElementById('bom-body');
  const wxNow     = document.getElementById('wx-now');
  const wxTable   = document.getElementById('wx-table-wrap');
  const wxUpdated = document.getElementById('wx-updated');
  const wwCard    = document.getElementById('ww-card');
  const wwBody    = document.getElementById('ww-body');
  const mapWrap   = document.getElementById('map-wrap');
  const mapPills  = document.getElementById('map-pills');

  let loadedAt = 0;

  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = deg => deg == null ? '–' : COMPASS[Math.round(deg / 22.5) % 16];
  const fmt = (v, dp = 0) => v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(dp);
  const hhmm = iso => iso.slice(11, 16);

  function cacheGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* full */ }
  }
  function ageLabel(at) {
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)} h ago`;
  }
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Open-Meteo model forecast ─────────────────────────────────────
  async function loadModel() {
    const common = `latitude=${point.lat}&longitude=${point.lon}&timezone=Australia%2FSydney&forecast_days=2`;
    const [wx, sea] = await Promise.all([
      fetchJson(`https://api.open-meteo.com/v1/forecast?${common}&wind_speed_unit=kn` +
        '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,weather_code' +
        '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m' +
        '&daily=sunrise,sunset'),
      fetchJson(`https://marine-api.open-meteo.com/v1/marine?${common}` +
        '&hourly=wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature')
    ]);
    return { wx, sea };
  }

  function renderModel({ wx, sea }, at) {
    wxUpdated.textContent = `· ${ageLabel(at)}`;
    const h = wx.hourly, m = sea.hourly;
    const nowKey = new Date().toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' }).slice(0, 13).replace(' ', 'T');
    let start = h.time.findIndex(t => t.slice(0, 13) >= nowKey);
    if (start < 0) start = 0;
    const seaIdx = t => m.time.indexOf(t);

    const c = wx.current || {};
    const si = seaIdx(h.time[start]);
    const tiles = [
      ['Wind', `${fmt(c.wind_speed_10m ?? h.wind_speed_10m[start])} kn ${compass(c.wind_direction_10m ?? h.wind_direction_10m[start])}`,
        `gusts ${fmt(c.wind_gusts_10m ?? h.wind_gusts_10m[start])} kn`],
      ['Swell', `${fmt(m.swell_wave_height[si], 1)} m ${compass(m.swell_wave_direction[si])}`,
        `${fmt(m.swell_wave_period[si])} s period`],
      ['Sea', `${fmt(m.wave_height[si], 1)} m`, 'combined waves'],
      ['Water', `${fmt(m.sea_surface_temperature[si], 1)} °C`, c.temperature_2m != null ? `air ${fmt(c.temperature_2m)} °C` : ''],
      ['Sun', `↑ ${hhmm(wx.daily.sunrise[0])}`, `↓ ${hhmm(wx.daily.sunset[0])}`]
    ];
    wxNow.replaceChildren(el('div', 'tiles'));
    const grid = wxNow.firstChild;
    tiles.forEach(([label, big, small]) => {
      const t = el('div', 'tile');
      t.append(el('span', 'tile-label', label), el('span', 'tile-big', big), el('span', 'tile-small', small));
      grid.append(t);
    });

    const table = el('table', 'data-table wx-table');
    table.innerHTML = '<thead><tr><th>Time</th><th>Wind kn</th><th>Gust</th><th>Swell</th><th>Sea</th><th>Rain</th></tr></thead>';
    const body = el('tbody');
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
      const j = seaIdx(h.time[i]);
      const tr = el('tr');
      const day = i > start && h.time[i].slice(11, 13) === '00';
      if (day) tr.className = 'day-break';
      [
        hhmm(h.time[i]),
        `${fmt(h.wind_speed_10m[i])} ${compass(h.wind_direction_10m[i])}`,
        fmt(h.wind_gusts_10m[i]),
        j < 0 ? '–' : `${fmt(m.swell_wave_height[j], 1)} ${compass(m.swell_wave_direction[j])} ${fmt(m.swell_wave_period[j])}s`,
        j < 0 ? '–' : fmt(m.wave_height[j], 1),
        h.precipitation_probability[i] == null ? '–' : `${h.precipitation_probability[i]}%`
      ].forEach(v => tr.append(el('td', null, v)));
      // Highlight strong wind (Strong Wind Warning threshold 26 kn)
      if (h.wind_speed_10m[i] >= 26 || h.wind_gusts_10m[i] >= 34) tr.classList.add('warn');
      body.append(tr);
    }
    table.append(body);
    wxTable.replaceChildren(table);
  }

  // ── BOM coastal waters forecast (via relay) ───────────────────────
  function renderBom(data, at) {
    bomBody.replaceChildren();
    if (data.issued) bomBody.append(el('p', 'muted small', `Issued ${data.issued} · fetched ${ageLabel(at)}`));
    data.areas.forEach(area => {
      bomBody.append(el('h3', null, area.name));
      if (area.synoptic) bomBody.append(el('p', 'muted small', area.synoptic));
      area.periods.slice(0, 2).forEach(p => {
        const box = el('div', 'bom-period');
        box.append(el('div', 'bom-when', p.label));
        if (p.warning) box.append(el('div', 'bom-warning', '⚠️ ' + p.warning));
        [['Winds', p.winds], ['Seas', p.seas], ['Swell', p.swell1], ['', p.swell2], ['Weather', p.weather], ['Caution', p.caution]]
          .filter(([, v]) => v)
          .forEach(([k, v]) => {
            const row = el('p');
            if (k) row.append(el('strong', null, k + ': '));
            row.append(v);
            box.append(row);
          });
        bomBody.append(box);
      });
    });
  }

  function bomUnavailable(msg) {
    bomBody.replaceChildren(el('p', 'muted', msg));
    const a = el('a', null, 'Open the BOM Sydney waters forecast');
    a.href = 'https://www.bom.gov.au/nsw/forecasts/sydneywaters.shtml';
    a.target = '_blank';
    a.rel = 'noopener';
    bomBody.append(a);
  }

  // ── WillyWeather tides & observations (via relay) ─────────────────
  function renderWw(data, at) {
    wwCard.hidden = false;
    wwBody.replaceChildren();
    if (data.tides?.length) {
      const p = el('p');
      p.append(el('strong', null, 'Tides today: '));
      p.append(data.tides.map(t => `${t.type === 'high' ? 'High' : 'Low'} ${t.time} ${fmt(t.height, 2)} m`).join(' · '));
      wwBody.append(p);
    }
    if (data.observed) {
      const o = data.observed;
      const p = el('p');
      p.append(el('strong', null, `Observed wind (${o.station}): `));
      p.append(`${fmt(o.speedKn)} kn ${o.direction || ''}, gusts ${fmt(o.gustKn)} kn at ${o.time}`);
      wwBody.append(p);
    }
    wwBody.append(el('p', 'muted small', `Fetched ${ageLabel(at)}`));
  }

  // ── Loader: try live, fall back to cache ──────────────────────────
  async function load(force = false) {
    if (!force && Date.now() - loadedAt < 10 * 60000) return;
    loadedAt = Date.now();

    loadModel()
      .then(d => { cacheSet(WX_CACHE, d); renderModel(d, Date.now()); })
      .catch(() => {
        const c = cacheGet(WX_CACHE);
        if (c) { renderModel(c.data, c.at); wxUpdated.textContent += ' (offline — cached)'; }
        else wxNow.replaceChildren(el('p', 'muted', 'No signal and no saved forecast yet.'));
      });

    if (!relay) {
      bomUnavailable('Live BOM forecast appears here once the relay is set up.');
      return;
    }
    fetchJson(`${relay}/bom`)
      .then(d => { cacheSet(BOM_CACHE, d); renderBom(d, Date.now()); })
      .catch(() => {
        const c = cacheGet(BOM_CACHE);
        if (c) renderBom(c.data, c.at); else bomUnavailable('Could not load the BOM forecast.');
      });
    fetchJson(`${relay}/ww`)
      .then(d => { cacheSet(WW_CACHE, d); renderWw(d, Date.now()); })
      .catch(() => { const c = cacheGet(WW_CACHE); if (c) renderWw(c.data, c.at); });
  }

  // ── Windy live map (loaded only when the tab is first opened) ─────
  function showMap(overlay) {
    const src = 'https://embed.windy.com/embed.html?type=map&location=coordinates' +
      `&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt&zoom=10&overlay=${overlay}&product=ecmwf&level=surface` +
      `&lat=${point.lat}&lon=${point.lon - 0.05}&detailLat=${point.lat}&detailLon=${point.lon}&marker=true`;
    let frame = mapWrap.querySelector('iframe');
    if (!frame) {
      frame = el('iframe');
      frame.title = 'Windy live map';
      frame.loading = 'lazy';
      mapWrap.append(frame);
    }
    frame.src = src;
  }
  mapPills.addEventListener('change', e => showMap(e.target.value));

  document.addEventListener('tabshown', e => {
    if (e.detail !== 'weather') return;
    load();
    if (!mapWrap.querySelector('iframe')) showMap(mapPills.querySelector('input:checked').value);
  });
})();

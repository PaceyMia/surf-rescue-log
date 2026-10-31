/* ── Surf Patrol Log – weather.js ──
   Weather tab:
   - Warnings and BOM marine forecast from weather.json (published by the
     "Weather data" GitHub workflow), shown as a badge/banner app-wide.
   - Model forecast from Open-Meteo (free, no key): now tiles, tide estimate
     and a 24-hour strip.
   - Sun, first and last light calculated on the device.
   - Live maps: Windy (wind, waves) and RainViewer (radar, auto-plays).
   Last good data is cached so a dead spot still shows the latest, with its age.
*/
(() => {
  const WX_CACHE   = 'surfPatrolWx';
  const FEED_CACHE = 'surfPatrolFeed';
  const UNITS_KEY  = 'surfPatrolUnits';
  const point = APP_CONFIG.forecastPoint;

  const $ = id => document.getElementById(id);
  const wxNow = $('wx-now'), wxStrip = $('wx-strip'), wxUpdated = $('wx-updated');
  const warningsCard = $('warnings-card'), warningsSummary = $('warnings-summary');
  const warningsBody = $('warnings-body'), warnBadge = $('warn-badge'), warnBanner = $('warning-banner');
  const bomBody = $('bom-body'), wwCard = $('ww-card'), wwBody = $('ww-body');
  const mapWrap = $('map-wrap'), mapPills = $('map-pills'), mapCredit = $('map-credit');
  const unitPills = $('wind-unit');

  let loadedAt = 0;
  let model = null; // last Open-Meteo data, re-rendered when units change
  let feed = null;  // last weather.json

  // ── Units (remembered per device) ─────────────────────────────────
  let units = { wind: 'kn' };
  try { units = { ...units, ...JSON.parse(localStorage.getItem(UNITS_KEY)) }; } catch { /* defaults */ }
  unitPills.querySelector(`input[value="${units.wind}"]`).checked = true;

  const windLabel = () => units.wind === 'kmh' ? 'km/h' : 'kn';
  const wind = kn => kn == null ? null : units.wind === 'kmh' ? kn * 1.852 : kn;

  unitPills.addEventListener('change', e => {
    units.wind = e.target.value;
    try { localStorage.setItem(UNITS_KEY, JSON.stringify(units)); } catch { /* storage unavailable */ }
    if (model) renderModel(model.data, model.at);
    if (feed) renderFeed(feed.data, feed.at);
  });

  // ── Helpers ───────────────────────────────────────────────────────
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = deg => deg == null ? '–' : COMPASS[Math.round(deg / 22.5) % 16];
  const fmt = (v, dp = 0) => v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(dp);
  const hhmm = d => d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: false });
  const sydneyKey = d => d.toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' }).slice(0, 13).replace(' ', 'T'); // YYYY-MM-DDTHH
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  function cacheGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function cacheSet(key, data) { try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* full */ } }
  function ageLabel(at) {
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)} h ago`;
  }
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Sun: sunrise/sunset and civil twilight (first/last light) ─────
  // Standard sunrise equation; zenith 90.833° for sun, 96° for civil twilight.
  function sunEvent(dateKey, zenith, rising) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const rad = Math.PI / 180;
    const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
    const lngHour = point.lon / 15;
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
    let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(point.lat * rad)) / (cosDec * Math.cos(point.lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = ((T - lngHour) % 24 + 24) % 24;
    let when = new Date(Date.UTC(y, m - 1, d) + UT * 3600000);
    // UT can land on the neighbouring UTC day — pull it into the local day asked for
    for (let i = 0; i < 2 && when.toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' }) !== dateKey; i++) {
      when = new Date(when.getTime() + (when.toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' }) < dateKey ? 1 : -1) * 86400000);
    }
    return when;
  }

  function sunToday() {
    const key = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' });
    return {
      firstLight: sunEvent(key, 96, true), sunrise: sunEvent(key, 90.833, true),
      sunset: sunEvent(key, 90.833, false), lastLight: sunEvent(key, 96, false)
    };
  }

  // ── Tide ──────────────────────────────────────────────────────────
  // Calculated on the phone from Fort Denison harmonic constants (tide.js):
  // free, works offline, high/low times within a few minutes.
  function tideInfo() {
    const now = Date.now();
    const events = Tide.turns(now - 13 * 3600000, now + 30 * 3600000);
    const next = events.filter(e => e.at > now);
    if (!next.length) return null;
    return {
      trend: next[0].type === 'high' ? 'rising' : 'falling',
      nextHigh: next.find(e => e.type === 'high'), nextLow: next.find(e => e.type === 'low'),
      prev: events.filter(e => e.at <= now).pop(),
      source: 'Fort Denison'
    };
  }

  // Within 15 minutes of a high or low, say so rather than rising/falling
  function tideHeadline(tide) {
    const margin = 15 * 60000;
    const next = [tide.nextHigh, tide.nextLow].filter(Boolean).sort((a, b) => a.at - b.at)[0];
    const prev = tide.prev;
    if (next && next.at - Date.now() < margin) return next.type === 'high' ? '≈ Near high' : '≈ Near low';
    if (prev && Date.now() - prev.at < margin) return prev.type === 'high' ? '≈ Near high' : '≈ Near low';
    return tide.trend === 'rising' ? '↑ Rising' : '↓ Falling';
  }

  // ── Open-Meteo model forecast ─────────────────────────────────────
  async function loadModel() {
    const common = `latitude=${point.lat}&longitude=${point.lon}&timezone=Australia%2FSydney&forecast_days=3`;
    const [wx, sea] = await Promise.all([
      fetchJson(`https://api.open-meteo.com/v1/forecast?${common}&wind_speed_unit=kn` +
        '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,temperature_2m,weather_code' +
        '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m'),
      fetchJson(`https://marine-api.open-meteo.com/v1/marine?${common}` +
        '&hourly=swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature')
    ]);
    return { wx, sea };
  }

  const SKY = code => code == null ? '' : code === 0 ? '☀️' : code <= 2 ? '🌤️' : code === 3 ? '☁️' : code <= 48 ? '🌫️'
    : code <= 67 ? '🌧️' : code <= 77 ? '🌨️' : code <= 82 ? '🌦️' : '⛈️';

  // Windy-style wind colours (by knots)
  function windColour(kn) {
    if (kn == null) return '';
    if (kn < 5) return '#9FD9F2';
    if (kn < 10) return '#7FE3C9';
    if (kn < 15) return '#8BE36E';
    if (kn < 20) return '#D6E85A';
    if (kn < 26) return '#FFD23F';
    if (kn < 34) return '#FF9A3C';
    return '#FF5A4E';
  }

  function tile(label, big, small, extraClass = '') {
    const t = el('div', `tile ${extraClass}`);
    t.append(el('span', 'tile-label', label), el('span', 'tile-big', big));
    if (small) t.append(el('span', 'tile-small', small));
    return t;
  }

  function renderModel({ wx, sea }, at) {
    model = { data: { wx, sea }, at };
    markReady('model');
    wxUpdated.textContent = `· ${ageLabel(at)}`;
    const h = wx.hourly, m = sea.hourly;
    const nowKey = sydneyKey(new Date());
    let start = h.time.findIndex(t => t.slice(0, 13) >= nowKey);
    if (start < 0) start = 0;
    const si = m.time.indexOf(h.time[start]);
    const c = wx.current || {};
    const sun = sunToday();
    const tide = tideInfo();

    const grid = el('div', 'tiles');
    grid.append(
      tile('Wind', `${fmt(wind(c.wind_speed_10m ?? h.wind_speed_10m[start]))} ${windLabel()} ${compass(c.wind_direction_10m ?? h.wind_direction_10m[start])}`,
        `gusts ${fmt(wind(c.wind_gusts_10m ?? h.wind_gusts_10m[start]))} ${windLabel()}`),
      tile('Swell', `${fmt(m.swell_wave_height[si], 1)} m ${compass(m.swell_wave_direction[si])}`,
        `${fmt(m.swell_wave_period[si])} s period`),
      tide
        ? tile('Tide', tideHeadline(tide),
            [tide.nextHigh && `High ${hhmm(tide.nextHigh.at)} (${fmt(tide.nextHigh.height, 1)} m)`,
             tide.nextLow && `Low ${hhmm(tide.nextLow.at)} (${fmt(tide.nextLow.height, 1)} m)`].filter(Boolean).join(' · '))
        : tile('Tide', '–', 'no tide data'),
      tile('Water', `${fmt(m.sea_surface_temperature[si], 1)} °C`, c.temperature_2m != null ? `air ${fmt(c.temperature_2m)} °C` : ''),
      tile('Sunrise / Sunset', `${sun.sunrise ? hhmm(sun.sunrise) : '–'} · ${sun.sunset ? hhmm(sun.sunset) : '–'}`, ''),
      tile('First / Last Light', `${sun.firstLight ? hhmm(sun.firstLight) : '–'} · ${sun.lastLight ? hhmm(sun.lastLight) : '–'}`, '')
    );
    wxNow.replaceChildren(grid);

    renderStrip(h, m, start, tide);
  }

  // Horizontal hour-by-hour strip, like Windy's bottom panel
  function renderStrip(h, m, start, tide) {
    const end = Math.min(start + 24, h.time.length);
    const cols = [];
    for (let i = start; i < end; i++) cols.push(i);

    // Tide direction per hour from the Fort Denison prediction
    const tideAt = i => {
      const ms = new Date(h.time[i] + ':00+11:00').getTime();
      return Tide.height(ms + 1800000) > Tide.height(ms) ? '↑' : '↓';
    };

    const rows = [
      ['', i => {
        const t = h.time[i];
        const label = t.slice(11, 13);
        return i === start || label === '00'
          ? `${new Date(t + ':00+11:00').toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Sydney' })} ${label}`
          : label;
      }, 'row-time'],
      ['', i => SKY(h.weather_code?.[i]), 'row-sky'],
      ['Temp °C', i => fmt(h.temperature_2m?.[i])],
      ['Rain mm', i => h.precipitation?.[i] ? fmt(h.precipitation[i], 1) : ''],
      [`Wind ${windLabel()}`, i => fmt(wind(h.wind_speed_10m[i])), 'row-wind'],
      [`Gusts ${windLabel()}`, i => fmt(wind(h.wind_gusts_10m[i])), 'row-gust'],
      ['Wind dir', i => compass(h.wind_direction_10m[i]), 'row-dir'],
      ['Swell m', i => { const j = m.time.indexOf(h.time[i]); return j < 0 ? '–' : fmt(m.swell_wave_height[j], 1); }],
      ['Period s', i => { const j = m.time.indexOf(h.time[i]); return j < 0 ? '–' : fmt(m.swell_wave_period[j]); }],
      ['Swell dir', i => { const j = m.time.indexOf(h.time[i]); return j < 0 ? '–' : compass(m.swell_wave_direction[j]); }],
      ['Tide', tideAt, 'row-tide']
    ];

    const table = el('table', 'strip');
    const tbody = el('tbody');
    rows.forEach(([label, value, cls]) => {
      const tr = el('tr', cls || '');
      tr.append(el('th', null, label));
      cols.forEach(i => {
        const td = el('td', i === start ? 'now' : '');
        const v = value(i);
        if (cls === 'row-dir') {
          const arrow = el('span', 'dir-arrow', '↓');
          arrow.style.transform = `rotate(${h.wind_direction_10m[i]}deg)`;
          td.append(arrow, el('span', 'dir-text', v));
        } else {
          td.textContent = v;
        }
        if (cls === 'row-wind') td.style.backgroundColor = windColour(h.wind_speed_10m[i]);
        if (cls === 'row-gust') td.style.backgroundColor = windColour(h.wind_gusts_10m[i]);
        if (h.time[i].slice(11, 13) === '00' && i !== start) td.classList.add('day-start');
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(tbody);
    wxStrip.replaceChildren(table);
  }

  // ── Feed: warnings + BOM forecast (+ WillyWeather) ────────────────
  // Sydney waters only: drop Illawarra-only warnings and Illawarra from area lists
  const SYDNEY = /sydney/i;
  function sydneyWarnings(list) {
    return list
      .map(w => ({ ...w, area: (w.area || '').split(/,\s*/).filter(a => SYDNEY.test(a)).join(', ') }))
      .filter(w => SYDNEY.test(`${w.title} ${w.area}`) || (!/illawarra/i.test(w.title) && !w.area));
  }

  function renderWarnings(all, at) {
    const list = sydneyWarnings(all);
    // Collapsed by default: the summary line carries the count and the first warning
    warningsSummary.textContent = list.length
      ? `⚠️ ${list.length} warning${list.length > 1 ? 's' : ''} — ${list[0].title}`
      : 'Warnings — none current';
    warningsCard.classList.toggle('has-warnings', list.length > 0);
    warningsBody.replaceChildren();
    if (!list.length) {
      warningsBody.append(el('p', 'all-clear', '✓ No current marine warnings for Sydney waters.'));
    }
    list.forEach(w => {
      const item = el('div', 'warning-item');
      item.append(el('strong', null, '⚠️ ' + w.title));
      const meta = [w.area, w.issued && `issued ${w.issued}`].filter(Boolean).join(' · ');
      if (meta) item.append(el('span', 'warning-meta', meta));
      warningsBody.append(item);
    });
    warningsBody.append(el('p', 'muted small', `BOM data checked ${ageLabel(at)}`));

    // App-wide signals: tab badge and a banner on the Log tab
    warnBadge.hidden = !list.length;
    warnBadge.textContent = list.length ? String(list.length) : '';
    warnBadge.setAttribute('aria-label', `${list.length} weather warnings`);
    warnBanner.hidden = !list.length;
    if (list.length) {
      warnBanner.textContent = `⚠️ ${list[0].title}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`;
    }
  }

  function renderBom(bom) {
    bomBody.replaceChildren();
    if (!bom?.areas?.length) { bomBody.append(el('p', 'muted', 'BOM forecast not available yet.')); return; }
    if (bom.issued) bomBody.append(el('p', 'muted small', `Issued ${bom.issued}`));
    bom.areas.filter(a => /^Sydney Coast/i.test(a.name)).forEach(area => {
      bomBody.append(el('h3', null, area.name));
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

  function renderWw(ww) {
    const o = ww?.observed;
    wwCard.hidden = !o;
    if (!o) return;
    const kmh = v => v == null ? null : units.wind === 'kmh' ? v : v / 1.852;
    wwBody.replaceChildren(el('p', null,
      `${fmt(kmh(o.speedKmh))} ${windLabel()} ${o.direction}, gusts ${fmt(kmh(o.gustKmh))} ${windLabel()} — ${o.station}, ${o.time}`));
    wwBody.append(el('p', 'muted small', 'Data: WillyWeather'));
  }

  function renderFeed(data, at) {
    feed = { data, at };
    markReady('feed');
    const updated = data.updated ? new Date(data.updated).getTime() : at;
    renderWarnings(data.warnings || [], updated);
    renderBom(data.bom);
    renderWw(data.ww);
    if (model) renderModel(model.data, model.at); // tide may now come from WillyWeather
  }

  // ── Loading screen: hide the tab until the forecast and BOM data are in ──
  const panel = $('panel-weather');
  const ready = new Set();
  function markReady(part) {
    ready.add(part);
    if (ready.has('model') && ready.has('feed')) panel.classList.remove('is-loading');
  }
  // Never leave people stuck on the spinner: show whatever there is after 10 s
  setTimeout(() => panel.classList.remove('is-loading'), 10000);

  // ── Loader: try live, fall back to cache ──────────────────────────
  async function load(force = false) {
    if (!force && Date.now() - loadedAt < 10 * 60000) return;
    loadedAt = Date.now();

    fetchJson(`${APP_CONFIG.dataUrl}?t=${Math.floor(Date.now() / 300000)}`)
      .then(d => { cacheSet(FEED_CACHE, d); renderFeed(d, Date.now()); })
      .catch(() => {
        const c = cacheGet(FEED_CACHE);
        if (c) renderFeed(c.data, c.at);
        else {
          warningsBody.replaceChildren(el('p', 'muted', 'Warnings unavailable — no signal. Check BOM when back in range.'));
          bomBody.replaceChildren(el('p', 'muted', 'BOM forecast unavailable — no signal.'));
          markReady('feed');
        }
      });

    loadModel()
      .then(d => { cacheSet(WX_CACHE, d); renderModel(d, Date.now()); })
      .catch(() => {
        const c = cacheGet(WX_CACHE);
        if (c) { renderModel(c.data, c.at); wxUpdated.textContent += ' (offline — saved)'; }
        else { wxNow.replaceChildren(el('p', 'muted', 'No signal and no saved forecast yet.')); markReady('model'); }
      });
  }

  // ── Live maps: one iframe per layer, kept loaded so switching is instant ──
  const frames = {};

  function mapSrc(layer) {
    // Radar is centred on Malabar (the dot overlay marks it). Wind/waves centre
    // east of the marker so Windy's detail popup isn't cut off at the right edge
    const lon = layer === 'radar' ? point.lon : point.lon + 0.07;
    return 'https://embed.windy.com/embed.html?type=map&location=coordinates' +
      `&metricRain=mm&metricTemp=%C2%B0C&metricWind=${units.wind === 'kmh' ? 'km%2Fh' : 'kt'}` +
      `&zoom=10&overlay=${layer}&product=${layer === 'radar' ? 'radar' : 'ecmwf'}&level=surface` +
      `&lat=${point.lat}&lon=${lon.toFixed(3)}&detailLat=${point.lat}&detailLon=${point.lon}&marker=true`;
  }

  function showMap(layer) {
    Object.entries(frames).forEach(([k, f]) => { f.hidden = k !== layer; });
    if (!frames[layer]) {
      const f = el('iframe');
      f.title = `${layer} map`;
      f.src = mapSrc(layer);
      f.setAttribute('allow', 'fullscreen');
      frames[layer] = f;
      mapWrap.append(f);
    }
    // White dot = Malabar on the radar. It's only right while the map hasn't
    // been moved, so it hides once the map is touched (the page loses focus).
    radarDot.hidden = layer !== 'radar';
    mapCredit.textContent = layer === 'radar'
      ? 'Map: Windy.com — white dot is Malabar; tap ▶ on the map to play the last hour of rain radar'
      : 'Map: Windy.com';
  }
  const radarDot = el('div', 'radar-dot');
  radarDot.hidden = true;
  radarDot.setAttribute('aria-label', 'Malabar');
  radarDot.append(el('span', 'radar-dot-label', 'Malabar'));
  mapWrap.append(radarDot);
  window.addEventListener('blur', () => {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') radarDot.hidden = true;
  });

  mapPills.addEventListener('change', e => showMap(e.target.value));

  // Windy is heavy (it slowed the whole tab), so only load it when the map
  // card scrolls into view
  const mapObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && !Object.keys(frames).length) {
      showMap(mapPills.querySelector('input:checked').value);
      mapObserver.disconnect();
    }
  }, { rootMargin: '200px' }) : null;

  document.addEventListener('tabshown', e => {
    if (e.detail !== 'weather') return;
    load();
    if (mapObserver) mapObserver.observe(mapWrap);
    else if (!Object.keys(frames).length) showMap(mapPills.querySelector('input:checked').value);
  });
  warnBanner.addEventListener('click', () => document.querySelector('[data-tab="weather"]').click());

  // Warnings matter even if nobody opens the Weather tab: check on start-up,
  // using the saved copy first so the badge shows straight away.
  const savedFeed = cacheGet(FEED_CACHE);
  if (savedFeed) renderFeed(savedFeed.data, savedFeed.at);
  fetchJson(`${APP_CONFIG.dataUrl}?t=${Math.floor(Date.now() / 300000)}`)
    .then(d => { cacheSet(FEED_CACHE, d); renderFeed(d, Date.now()); })
    .catch(() => { /* offline — saved copy (if any) already shown */ });

  // Get the forecast ready in the background so the tab opens loaded
  setTimeout(() => load(), 1500);

  window.sunEventForTest = sunEvent;
})();

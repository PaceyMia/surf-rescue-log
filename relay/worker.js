/* ── Surf Patrol Log – relay (Cloudflare Worker) ──
   Two endpoints for the Weather tab:
     GET /bom  BOM coastal waters (Sydney, Illawarra) + Sydney Enclosed Waters, as JSON
     GET /ww   WillyWeather tides and observed wind near Malabar
   Why a relay: BOM refuses requests made from other websites, and the
   WillyWeather key must not be shipped inside the app.

   Settings (Cloudflare dashboard → Worker → Settings → Variables):
     WW_API_KEY       secret — your WillyWeather API key
     WW_LOCATION_ID   optional — WillyWeather location id (found automatically from "Malabar" if blank)
     ALLOWED_ORIGIN   optional — defaults to https://paceymia.github.io
*/
const CACHE_SECONDS = { bom: 1800, ww: 900 };
const BOM_PRODUCTS = [
  { url: 'https://www.bom.gov.au/fwo/IDN11001.xml', areas: ['NSW_MW004', 'NSW_MW003'] },
  { url: 'https://www.bom.gov.au/fwo/IDN11013.xml', areas: ['NSW_MW009'] }
];

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || 'https://paceymia.github.io';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const path = new URL(request.url).pathname.replace(/\/$/, '');
    const route = path === '/bom' ? 'bom' : path === '/ww' ? 'ww' : null;
    if (!route) return new Response('Not found', { status: 404, headers: cors });

    // Serve from Cloudflare's cache so BOM/WillyWeather are hit at most every 15–30 min
    const cache = caches.default;
    const cacheKey = new Request(new URL(path, request.url).toString());
    const hit = await cache.match(cacheKey);
    if (hit) return withHeaders(hit, cors);

    try {
      const data = route === 'bom' ? await getBom() : await getWw(env);
      const res = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS[route]}` }
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return withHeaders(res, cors);
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message || err) }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }
};

function withHeaders(res, extra) {
  const r = new Response(res.body, res);
  Object.entries(extra).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

// ── BOM XML → JSON (Workers have no DOMParser, so a small tag reader) ──
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || '';

async function getBom() {
  const areas = [];
  let issued = '';
  for (const product of BOM_PRODUCTS) {
    const res = await fetch(product.url, { headers: { 'User-Agent': 'Mozilla/5.0 (SR30 patrol log relay)' } });
    if (!res.ok) throw new Error(`BOM ${res.status}`);
    const xml = await res.text();
    if (!issued) {
      const t = (xml.match(/<issue-time-local[^>]*>([^<]+)</) || [])[1];
      if (t) issued = new Date(t).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    const areaRe = /<area\b([^>]*)>([\s\S]*?)<\/area>/g;
    let m;
    while ((m = areaRe.exec(xml))) {
      const aac = attr(m[1], 'aac');
      if (!product.areas.includes(aac)) continue;
      const periods = [];
      let synoptic = '';
      const periodRe = /<forecast-period\b([^>]*)>([\s\S]*?)<\/forecast-period>/g;
      let p;
      while ((p = periodRe.exec(m[2]))) {
        const text = {};
        const textRe = /<text type="([^"]+)">([\s\S]*?)<\/text>/g;
        let t;
        while ((t = textRe.exec(p[2]))) text[t[1]] = decode(t[2]);
        const warnings = [...p[2].matchAll(/<warning-summary[^>]*>([\s\S]*?)<\/warning-summary>/g)].map(w => decode(w[1]));
        // Some products open with an overview-only period (no index)
        if (text.synoptic_situation && !synoptic) synoptic = text.synoptic_situation;
        if (!text.forecast_winds && !text.forecast_seas && !text.forecast_weather) continue;
        const start = attr(p[1], 'start-time-local');
        const label = start
          ? new Date(start).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', day: 'numeric', month: 'short' })
          : '';
        periods.push({
          label,
          warning: warnings.join(' · '),
          winds: text.forecast_winds || '',
          seas: text.forecast_seas || '',
          swell1: text.forecast_swell1 || '',
          swell2: text.forecast_swell2 || '',
          weather: text.forecast_weather || '',
          caution: text.forecast_caution || ''
        });
      }
      areas.push({ name: attr(m[1], 'description').replace(/ coast$/, ''), synoptic, periods });
    }
  }
  return { issued, areas };
}

// ── WillyWeather ────────────────────────────────────────────────────
// API v2: https://api.willyweather.com.au/v2/{key}/...
// Check field names against the docs once the key is active:
// https://www.willyweather.com.au/api/docs/index.html
async function getWw(env) {
  if (!env.WW_API_KEY) throw new Error('WW_API_KEY not set');
  const base = `https://api.willyweather.com.au/v2/${env.WW_API_KEY}`;
  let id = env.WW_LOCATION_ID;
  if (!id) {
    const found = await (await fetch(`${base}/search.json?query=Malabar&limit=1`)).json();
    id = found?.[0]?.id;
    if (!id) throw new Error('Malabar not found');
  }
  const res = await fetch(`${base}/locations/${id}/weather.json?forecasts=tides&observational=true&days=1`);
  if (!res.ok) throw new Error(`WillyWeather ${res.status}`);
  const data = await res.json();

  const hhmm = s => (s || '').slice(11, 16);
  const tides = (data.forecasts?.tides?.days?.[0]?.entries || []).map(e => ({
    time: hhmm(e.dateTime), height: e.height, type: e.type
  }));
  const wind = data.observational?.observations?.wind;
  const kmhToKn = v => v == null ? null : v / 1.852;
  const observed = wind ? {
    station: data.observational?.stations?.wind?.name || 'nearest station',
    speedKn: kmhToKn(wind.speed),
    gustKn: kmhToKn(wind.gustSpeed),
    direction: wind.directionText || '',
    time: hhmm(data.observational?.issueDateTime)
  } : null;
  return { location: data.location?.name, tides, observed };
}

// Builds weather.json for the app from BOM marine forecasts, BOM warnings and
// (if a key is set) WillyWeather tides/observations.
// Run by .github/workflows/weather-data.yml every 30 minutes. The workflow
// downloads the BOM files from BOM's anonymous FTP service (their documented
// route for automated access) into <bom-dir>; this script only parses them.
//   node data-scripts/fetch_weather.mjs <out-dir> <bom-dir>
// Env: WW_API_KEY (optional), WW_LOCATION_ID (optional)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOM_PRODUCTS = [
  { file: 'IDN11001.xml', areas: ['NSW_MW004', 'NSW_MW003'] }, // Sydney, Illawarra coast
  { file: 'IDN11013.xml', areas: ['NSW_MW009'] }               // Sydney Enclosed Waters
];
const WARNINGS_RSS = 'IDZ00054.warnings_nsw.xml';
const bomDir = process.argv[3] || 'bom';
// Warnings that matter on the water off Sydney. Severe weather/thunderstorm
// warnings cover the whole state, so only keep those that mention our area.
const MARINE = /marine wind|hazardous surf|gale|storm force|hurricane|tsunami|coastal hazard|damaging surf/i;
const LOCAL_SEVERE = /(severe (thunderstorm|weather)).*(sydney|metropolitan|illawarra|coast)/i;
const relevant = title => MARINE.test(title) || LOCAL_SEVERE.test(title);

const decode = s => s.replace(/\s+/g, ' ').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").trim();
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || '';
const sydney = (iso, opts) => new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour12: false, ...opts });

async function text(file) {
  return readFileSync(join(bomDir, file), 'utf8');
}

// ── BOM coastal & local waters forecasts ───────────────────────────
async function getBom() {
  const areas = [];
  const coastWarnings = [];
  let issued = '';
  for (const product of BOM_PRODUCTS) {
    const xml = await text(product.file);
    if (!issued) {
      const t = (xml.match(/<issue-time-utc[^>]*>([^<]+)</) || [])[1];
      if (t) issued = sydney(t, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    for (const m of xml.matchAll(/<area\b([^>]*)>([\s\S]*?)<\/area>/g)) {
      if (!product.areas.includes(attr(m[1], 'aac'))) continue;
      const name = attr(m[1], 'description').replace(/ coast$/, '');
      const periods = [];
      let synoptic = '';
      for (const p of m[2].matchAll(/<forecast-period\b([^>]*)>([\s\S]*?)<\/forecast-period>/g)) {
        const t = {};
        for (const x of p[2].matchAll(/<text type="([^"]+)">([\s\S]*?)<\/text>/g)) t[x[1]] = decode(x[2]);
        const warnings = [...p[2].matchAll(/<warning-summary[^>]*>([\s\S]*?)<\/warning-summary>/g)].map(w => decode(w[1]));
        if (t.synoptic_situation && !synoptic) synoptic = t.synoptic_situation;
        if (!t.forecast_winds && !t.forecast_seas && !t.forecast_weather) continue;
        const start = attr(p[1], 'start-time-utc');
        const label = start ? sydney(start, { weekday: 'long', day: 'numeric', month: 'short' }).replace(/ at .*/, '') : '';
        if (periods.length < 2) warnings.forEach(w => coastWarnings.push({ title: w, area: name, source: 'BOM coastal waters forecast' }));
        periods.push({
          label, warning: warnings.join(' · '),
          winds: t.forecast_winds || '', seas: t.forecast_seas || '',
          swell1: t.forecast_swell1 || '', swell2: t.forecast_swell2 || '',
          weather: t.forecast_weather || '', caution: t.forecast_caution || ''
        });
      }
      areas.push({ name, synoptic, periods });
    }
  }
  return { issued, areas, coastWarnings };
}

// ── BOM NSW warnings feed ──────────────────────────────────────────
async function getWarnings() {
  const xml = await text(WARNINGS_RSS);
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = tag => decode((m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || '');
    const title = get('title').replace(/^\d+\/\d+:\d+ \w+\s*/, ''); // drop "31/11:22 EDT "
    if (!title || !relevant(title)) continue;
    const link = get('link').replace(/^http:\/\/reg\./, 'https://www.');
    const pub = get('pubDate');
    items.push({ title, link, issued: pub ? sydney(pub, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '', source: 'BOM warnings' });
  }
  return items;
}

// ── WillyWeather (only when a key is configured) ───────────────────
async function getWw() {
  const key = process.env.WW_API_KEY;
  if (!key) return null;
  const base = `https://api.willyweather.com.au/v2/${key}`;
  let id = process.env.WW_LOCATION_ID;
  if (!id) {
    const found = await (await fetch(`${base}/search.json?query=Malabar&limit=1`)).json();
    id = found?.[0]?.id;
    if (!id) throw new Error('WillyWeather: Malabar not found');
  }
  const res = await fetch(`${base}/locations/${id}/weather.json?forecasts=tides&observational=true&days=2`);
  if (!res.ok) throw new Error(`WillyWeather HTTP ${res.status}`);
  const data = await res.json();
  // Field names per WillyWeather API v2 docs — verify against the first live response
  const tides = (data.forecasts?.tides?.days || []).flatMap(d => d.entries || []).map(e => ({
    dateTime: e.dateTime, height: e.height, type: e.type
  }));
  const wind = data.observational?.observations?.wind;
  const observed = wind ? {
    station: data.observational?.stations?.wind?.name || 'nearest station',
    speedKmh: wind.speed, gustKmh: wind.gustSpeed, direction: wind.directionText || '',
    time: (data.observational?.issueDateTime || '').slice(11, 16)
  } : null;
  return { location: data.location?.name, tides, observed };
}

const out = process.argv[2] || 'out';
mkdirSync(out, { recursive: true });
const result = { updated: new Date().toISOString(), errors: [] };
const settle = async (name, fn) => {
  try { return await fn(); } catch (e) { result.errors.push(`${name}: ${e.message}`); console.error(name, e.message); return null; }
};
const bom = await settle('bom', getBom);
const warnings = await settle('warnings', getWarnings);
result.bom = bom ? { issued: bom.issued, areas: bom.areas } : null;
result.warnings = [...(bom?.coastWarnings || []), ...(warnings || [])];
result.ww = await settle('willyweather', getWw);
writeFileSync(join(out, 'weather.json'), JSON.stringify(result, null, 1));
console.log(`areas ${result.bom?.areas.length ?? 0}, warnings ${result.warnings.length}, ww ${result.ww ? 'yes' : 'no'}, errors ${result.errors.length}`);
if (!result.bom && !warnings) process.exit(1);

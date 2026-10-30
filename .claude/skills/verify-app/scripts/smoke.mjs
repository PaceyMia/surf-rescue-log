// Smoke test for the patrol log: serves the repo, drives it in headless
// Chromium at phone size with a fake SpeechRecognition and fake GPS, and
// checks the core flow. Weather APIs are mocked so it runs without network.
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// ── Fake SpeechRecognition ─────────────────────────────────────────
// __speech.say(text) emits a final result, interim(text) a partial one,
// autoEnd() ends the session as the browser would (timeout, screen lock),
// error(code) fires onerror then onend. __speech.sessions counts start() calls.
const fakeSpeech = () => {
  let active = null;
  class FakeRecognition {
    start() { window.__speech.sessions++; setTimeout(() => { active = this; this.onstart?.(); }, 0); }
    stop() { setTimeout(() => this._end(), 0); }
    _end() { if (active === this) active = null; this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  const emit = (text, isFinal) => {
    const result = Object.assign([{ transcript: text, confidence: 1 }], { isFinal });
    active?.onresult?.({ resultIndex: 0, results: [result] });
  };
  window.__speech = {
    sessions: 0,
    get active() { return !!active; },
    say: text => emit(text, true),
    interim: text => emit(text, false),
    autoEnd() { active?._end(); },
    error(code) { const a = active; a?.onerror?.({ error: code }); a?._end(); },
  };
  navigator.share = undefined; // force the download fallback
};

// Minimal Open-Meteo responses for the Weather tab
const hours = Array.from({ length: 48 }, (_, i) => {
  const d = new Date(Date.now() + (i - 2) * 3600000);
  return d.toLocaleString('sv-SE', { timeZone: 'Australia/Sydney' }).slice(0, 13).replace(' ', 'T') + ':00';
});
const forecastFixture = {
  current: { wind_speed_10m: 14, wind_direction_10m: 22, wind_gusts_10m: 20, temperature_2m: 22 },
  hourly: { time: hours, wind_speed_10m: hours.map((_, i) => i === 6 ? 28 : 15), wind_direction_10m: hours.map(() => 22),
            wind_gusts_10m: hours.map(() => 22), precipitation_probability: hours.map(() => 40), weather_code: hours.map(() => 3) },
  daily: { sunrise: [hours[0].slice(0, 11) + '05:48'], sunset: [hours[0].slice(0, 11) + '19:28'] }
};
const marineFixture = {
  hourly: { time: hours, wave_height: hours.map(() => 1.6), swell_wave_height: hours.map(() => 1.2),
            swell_wave_direction: hours.map(() => 180), swell_wave_period: hours.map(() => 9), sea_surface_temperature: hours.map(() => 20.5) }
};

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true,
  locale: 'en-AU', timezoneId: 'Australia/Sydney',
  permissions: ['geolocation'], geolocation: { latitude: -33.9685, longitude: 151.2700, accuracy: 8 }
});
await context.addInitScript(fakeSpeech);
await context.route('**/api.open-meteo.com/**', r => r.fulfill({ json: forecastFixture }));
await context.route('**/marine-api.open-meteo.com/**', r => r.fulfill({ json: marineFixture }));
// Pretend the relay is deployed so the BOM and WillyWeather cards render
await context.route('**/config.js', async r => {
  const body = (await readFile(join(ROOT, 'config.js'), 'utf8')).replace("relayUrl: ''", "relayUrl: 'https://relay.test'");
  await r.fulfill({ body, contentType: 'text/javascript' });
});
await context.route('https://relay.test/bom', r => r.fulfill({ json: { issued: 'Sat 10:00', areas: [{ name: 'Sydney Coast: Broken Bay to Port Hacking', synoptic: '',
  periods: [{ label: 'Saturday 31 Oct', warning: 'Strong Wind Warning for Saturday for Sydney Coast', winds: 'Northerly 20 to 25 knots.', seas: '1.5 to 2 metres.', swell1: 'Southerly 1 to 1.5 metres.', swell2: '', weather: 'Partly cloudy.', caution: '' }] }] } }));
await context.route('https://relay.test/ww', r => r.fulfill({ json: { location: 'Malabar', tides: [{ time: '07:50', height: 1.6, type: 'high' }, { time: '13:58', height: 0.5, type: 'low' }],
  observed: { station: 'Little Bay', speedKn: 8, gustKn: 12, direction: 'NNE', time: '09:00' } } }));
await context.route('**/embed.windy.com/**', r => r.fulfill({ body: '<html><body>map</body></html>', contentType: 'text/html' }));
const page = await context.newPage();
page.on('dialog', d => d.accept());
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const startRec = async () => {
  await page.click('#dictate-btn');
  await page.waitForFunction(() => window.__speech.active);
};
const stopRec = async () => {
  await page.click('#dictate-btn');
  await page.waitForFunction(() => !window.__speech.active && !document.getElementById('dictate-btn').classList.contains('listening'));
};
const record = async (text) => {
  await startRec();
  await page.evaluate(t => window.__speech.say(t), text);
  await stopRec();
};
const entryTexts = () => page.$$eval('.log-entry .text', els => els.map(e => e.textContent));

await page.goto(url);

// ── Start screen ───────────────────────────────────────────────────
await check('first load shows the start screen, not the log', async () => {
  assert(await page.isVisible('#start-screen'), 'start screen hidden');
  assert(!(await page.isVisible('#dictate-btn')), 'log controls visible before crew entered');
  assert(await page.isChecked('input[name="duty"][value="Patrol"]'), 'Patrol not the default duty');
  assert(await page.locator('.crew-extra').count() === 3, 'expected 3 optional crew rows');
});

await check('date defaults to the local calendar date', async () => {
  const [value, expected] = await page.evaluate(() => {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    return [document.getElementById('patrol-date').value, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`];
  });
  assert(value === expected, `date ${value}, expected ${expected}`);
});

await check('skipper and driver are required', async () => {
  await page.click('#start-btn');
  assert(await page.isVisible('#start-screen'), 'started without skipper/driver');
  const err = await page.textContent('#start-error');
  assert(/skipper/.test(err) && /driver/.test(err), `error was "${err}"`);
});

await check('Other duty opens a text box and requires it', async () => {
  await page.click('label.pill:has-text("Other")');
  assert(await page.isVisible('#duty-other'), 'other text box not shown');
  await page.fill('#crew-skipper', 'Matt Pacey');
  await page.fill('#crew-driver', 'Marie Bowen');
  await page.click('#start-btn');
  assert(await page.isVisible('#start-screen'), 'started with empty Other duty');
  await page.click('label.pill:has-text("Patrol")');
  assert(!(await page.isVisible('#duty-other')), 'other text box still shown');
});

await check('add crew adds more rows than the default three', async () => {
  await page.click('#add-crew-btn');
  assert(await page.locator('.crew-extra').count() === 4, 'add crew did not add a row');
});

await check('start patrol opens the log with a crew summary', async () => {
  await page.fill('.crew-extra >> nth=0', 'Nick Tyler');
  await page.fill('.crew-extra >> nth=1', 'Chiara Palazzo');
  await page.click('#start-btn');
  assert(await page.isVisible('#dictate-btn'), 'log not shown');
  const summary = await page.textContent('#shift-summary');
  assert(summary.includes('Patrol') && summary.includes('Matt Pacey') && summary.includes('Chiara Palazzo'), `summary "${summary}"`);
});

// ── Recording ──────────────────────────────────────────────────────
await check('records an entry with formatting and local-word corrections', async () => {
  await record('two swimmers near bear island at 1430 hours');
  const texts = await entryTexts();
  assert(texts.at(-1) === 'Two swimmers near Bare Island at 14:30 hrs.', `got ${JSON.stringify(texts.at(-1))}`);
});

await check('voice entries get a GPS position and nearest landmark', async () => {
  await page.waitForFunction(() => document.querySelector('.log-entry:last-child .pos'), null, { timeout: 5000 });
  const pos = await page.textContent('.log-entry:last-child .pos');
  assert(/33°58\.\d{3}′S 151°16\.\d{3}′E/.test(pos) && /NM \d{3}°T from|at /.test(pos), `pos "${pos}"`);
});

await check('live box shows words as they are heard', async () => {
  await startRec();
  assert(await page.isVisible('#live-box'), 'live box hidden while recording');
  await page.evaluate(() => window.__speech.interim('rip forming'));
  assert((await page.textContent('#live-text')).includes('rip forming'), 'interim text not shown');
  await page.evaluate(() => window.__speech.say('rip forming north end'));
  await stopRec();
  assert(!(await page.isVisible('#live-box')), 'live box still visible after stop');
});

await check('mic stays live when the browser ends the session itself', async () => {
  await startRec();
  const before = await page.evaluate(() => window.__speech.sessions);
  await page.evaluate(() => { window.__speech.say('kayaker heading south'); window.__speech.autoEnd(); });
  await page.waitForFunction(b => window.__speech.sessions > b && window.__speech.active, before);
  assert(await page.evaluate(() => document.getElementById('dictate-btn').classList.contains('listening')), 'stopped listening');
  await page.evaluate(() => window.__speech.say('towards cape banks'));
  await stopRec();
  const texts = await entryTexts();
  assert(texts.includes('Kayaker heading south towards Cape Banks.'), `got ${JSON.stringify(texts)}`);
});

await check('keeps transcript when the mic is blocked mid-recording', async () => {
  await startRec();
  await page.evaluate(() => { window.__speech.say('patient conscious and breathing'); window.__speech.error('not-allowed'); });
  await page.waitForFunction(() => !document.getElementById('dictate-btn').classList.contains('listening'));
  const texts = await entryTexts();
  assert(texts.includes('Patient conscious and breathing.'), 'transcript discarded on fatal error');
});

await check('entries persist across reload', async () => {
  const count = (await entryTexts()).length;
  await page.reload();
  assert((await entryTexts()).length === count, 'entries lost on reload');
  assert(await page.isVisible('#dictate-btn'), 'reload returned to start screen mid-shift');
});

await check('a recording interrupted by the app closing is recovered', async () => {
  const count = (await entryTexts()).length;
  await page.evaluate(() => localStorage.setItem('surfPatrolDraft',
    JSON.stringify({ startedAt: new Date().toISOString(), text: 'surfer with board leg rope tangled' })));
  await page.reload();
  const texts = await entryTexts();
  assert(texts.length === count + 1 && texts.some(t => t.includes('[recovered]')), `got ${JSON.stringify(texts.at(-1))}`);
});

await check('tap an entry to edit it', async () => {
  await page.click('.log-entry >> nth=0');
  assert(await page.isVisible('#edit-dialog'), 'edit dialog not shown');
  await page.fill('#edit-text', 'Two swimmers near Bare Island at 14:30 hrs, both assisted ashore.');
  await page.click('#edit-save');
  await page.waitForFunction(() => document.querySelector('.log-entry .text').textContent.includes('both assisted ashore'), null, { timeout: 3000 });
  assert(!(await page.isVisible('#edit-dialog')), 'dialog still open');
});

await check('mark button logs the current position', async () => {
  const count = (await entryTexts()).length;
  await page.click('#mark-btn');
  await page.waitForFunction(c => document.querySelectorAll('.log-entry').length > c, count);
  assert((await entryTexts()).includes('Position marked.'), 'no mark entry');
});

// ── Crew changes ───────────────────────────────────────────────────
await check('logging off and adding crew records a crew change', async () => {
  await page.click('#shift-summary');
  assert(await page.inputValue('#crew-skipper') === 'Matt Pacey', 'crew not prefilled');
  const rows = page.locator('.crew-row:has(.crew-extra)');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    if (await rows.nth(i).locator('.crew-extra').inputValue() === 'Nick Tyler') { await rows.nth(i).locator('.row-remove').click(); break; }
  }
  await page.click('#add-crew-btn');
  await page.fill('.crew-extra >> nth=-1', 'Doug Lucas');
  await page.click('#start-btn');
  const texts = await entryTexts();
  assert(texts.includes('Crew change — Off: Nick Tyler (C). On: Doug Lucas (C).'), `got ${JSON.stringify(texts.at(-1))}`);
  const summary = await page.textContent('#shift-summary');
  assert(summary.includes('Doug Lucas') && !summary.includes('Nick Tyler'), `summary "${summary}"`);
});

await check('swipe deletes an entry', async () => {
  const count = (await entryTexts()).length;
  const card = await page.$('.log-entry');
  const box = await card.boundingBox();
  const y = box.y + box.height / 2;
  await card.dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: box.x + 20, clientY: y }] });
  await card.dispatchEvent('touchmove', { touches: [{ identifier: 0, clientX: box.x + 160, clientY: y }] });
  await card.dispatchEvent('touchend', { touches: [] });
  await page.waitForTimeout(400);
  assert((await entryTexts()).length === count - 1, 'entry not deleted');
});

await check('end of shift report has duty, crew, logged-off crew and positions', async () => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#report-btn')]);
  const body = await readFile(await download.path(), 'utf8');
  assert(body.includes('Duty     : Patrol'), 'report missing duty');
  assert(body.includes('S  Matt Pacey') && body.includes('D  Marie Bowen') && body.includes('C  Doug Lucas'), 'report missing crew');
  assert(/Logged off:\n\s+C  Nick Tyler \(off \d\d:\d\d\)/.test(body), 'report missing logged-off crew');
  assert(/Pos: 33°58\.\d{3}′S/.test(body), 'report missing positions');
});

// ── Tabs ───────────────────────────────────────────────────────────
await check('weather tab shows conditions and highlights strong wind', async () => {
  await page.click('[data-tab="weather"]');
  await page.waitForSelector('.tile', { timeout: 5000 });
  const now = await page.textContent('#wx-now');
  assert(now.includes('14 kn NNE') && now.includes('1.2 m S') && now.includes('20.5 °C'), `now "${now}"`);
  assert(await page.locator('.wx-table tr.warn').count() >= 1, 'strong wind row not highlighted');
  assert(await page.locator('#map-wrap iframe').count() === 1, 'map not loaded');
  await page.waitForSelector('.bom-warning', { timeout: 5000 });
  assert((await page.textContent('#bom-body')).includes('Strong Wind Warning for Saturday'), 'BOM warning not shown');
  await page.waitForSelector('#ww-card:not([hidden])', { timeout: 5000 });
  assert((await page.textContent('#ww-body')).includes('High 07:50 1.60 m'), 'tides not shown');
});

await check('tools: speed/distance/time defaults to knots and NM', async () => {
  await page.click('[data-tab="tools"]');
  await page.fill('#sdt-speed', '10');
  await page.fill('#sdt-dist', '5');
  const r = await page.textContent('#sdt-result');
  assert(r.startsWith('Time: 30 min'), `got "${r}"`);
  await page.click('#sdt-clear');
  await page.fill('#sdt-dist', '3');
  await page.fill('#sdt-min', '15');
  assert((await page.textContent('#sdt-result')) === 'Speed: 12.0 kn', 'speed calc wrong');
});

await check('tools: position converter reads degrees-decimal-minutes', async () => {
  await page.fill('#pos-convert', '33 58.11 S 151 16.20 E');
  const r = await page.textContent('#pos-convert-result');
  assert(r.includes('-33.96850, 151.27000'), `got "${r}"`);
});

await check('tools: fuel range uses the rule of thirds', async () => {
  await page.fill('#fuel-onboard', '300');
  await page.fill('#fuel-burn', '60');
  await page.fill('#fuel-speed', '20');
  const r = await page.textContent('#fuel-result');
  assert(r.includes('Endurance 5 h 0 min') && r.includes('1 h 40 min out') && r.includes('Radius 33.3 NM'), `got "${r}"`);
});

// ── 2 NM boundary ──────────────────────────────────────────────────
const pointAt = async (targetM) => page.evaluate(t => {
  // Walk east from Malabar until the distance to land reaches t metres
  for (let lon = 151.265; lon < 151.40; lon += 0.0002) {
    if (window.boundary.distanceToLand(-33.965, lon) >= t) return lon;
  }
  return null;
}, targetM);

await check('2 NM limit is measured from the outermost land or outcrop', async () => {
  const lon = await pointAt(3704);
  assert(lon > 151.295 && lon < 151.32, `2 NM off Malabar at lon ${lon}`);
  const cake = await page.evaluate(() => window.boundary.distanceToLand(-33.926, 151.2654));
  assert(cake < 60, `Wedding Cake Island not treated as land (${Math.round(cake)} m)`);
});

await check('boundary alarm warns at 500 m and alerts beyond the limit', async () => {
  const warnLon = await pointAt(3400);
  const beyondLon = await pointAt(3900);
  await page.click('#boundary-toggle');
  await page.waitForFunction(() => document.getElementById('boundary-bar').className === 'boundary-inside');
  await context.setGeolocation({ latitude: -33.965, longitude: warnLon, accuracy: 8 });
  await page.waitForFunction(() => document.getElementById('boundary-bar').className === 'boundary-warning', null, { timeout: 5000 });
  await context.setGeolocation({ latitude: -33.965, longitude: beyondLon, accuracy: 8 });
  await page.waitForFunction(() => document.getElementById('boundary-bar').className === 'boundary-beyond', null, { timeout: 5000 });
  assert((await page.textContent('#boundary-readout')).includes('BEYOND'), 'readout does not say beyond');
  assert(await page.locator('#boundary-map .m-limit').count() >= 1, 'map has no limit line');
});

await check('no uncaught page errors', async () => {
  assert(errors.length === 0, errors.join('; '));
});

// ── Screenshots ────────────────────────────────────────────────────
const shotDir = await mkdtemp(join(process.env.CLAUDE_SCRATCH || tmpdir(), 'smoke-'));
const shoot = async (name, fn) => { try { await fn(); await page.screenshot({ path: join(shotDir, name) }); } catch (e) { console.log(`(screenshot ${name} skipped: ${e.message.split('\n')[0]})`); } };
await shoot('tools.png', async () => { await page.click('[data-tab="tools"]'); });
try { await page.locator('#boundary-map').screenshot({ path: join(shotDir, 'boundary-map.png') }); } catch { /* optional */ }
await shoot('log.png', async () => { await page.click('[data-tab="log"]'); });
await shoot('recording.png', async () => {
  await startRec();
  await page.evaluate(() => window.__speech.interim('jet ski broken down east of'));
});
try { await page.evaluate(() => window.__speech.say('jet ski broken down east of boora point')); await stopRec(); } catch { /* optional */ }
await shoot('weather.png', async () => { await page.click('[data-tab="weather"]'); });
await shoot('info.png', async () => { await page.click('[data-tab="info"]'); });
await shoot('crew-edit.png', async () => { await page.click('[data-tab="log"]'); await page.click('#shift-summary'); });
await shoot('log-ipad.png', async () => { await page.setViewportSize({ width: 820, height: 1180 }); await page.click('#start-cancel'); });
await browser.close();
server.close();

for (const [status, name, msg] of results) console.log(`${status}  ${name}${msg ? ` — ${msg}` : ''}`);
console.log(`\nScreenshots: ${shotDir}`);
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);

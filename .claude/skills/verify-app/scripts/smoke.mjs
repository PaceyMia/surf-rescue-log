// Smoke test for the patrol log: serves the repo, drives it in headless
// Chromium at phone size with a fake SpeechRecognition, and checks the core flow.
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
// window.__speech.say(text) emits a final result; autoEnd() simulates the
// browser ending the session on its own (timeout, network drop, screen lock).
const fakeSpeech = () => {
  let active = null;
  class FakeRecognition {
    start() { active = this; setTimeout(() => this.onstart?.(), 0); }
    stop() { setTimeout(() => this._end(), 0); }
    _end() { if (active === this) active = null; this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.__speech = {
    get active() { return !!active; },
    say(text) {
      const result = Object.assign([{ transcript: text, confidence: 1 }], { isFinal: true });
      const results = [result];
      active?.onresult?.({ resultIndex: 0, results });
    },
    autoEnd() { active?._end(); },
  };
  navigator.share = undefined; // force the download fallback
};

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
await context.addInitScript(fakeSpeech);
const page = await context.newPage();
page.on('dialog', d => d.accept());
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const record = async (text) => {
  await page.click('#dictate-btn');
  await page.waitForFunction(() => window.__speech.active);
  await page.evaluate(t => window.__speech.say(t), text);
  await page.click('#dictate-btn');
  await page.waitForFunction(() => !window.__speech.active);
};
const entryTexts = () => page.$$eval('.log-entry .text', els => els.map(e => e.textContent));

await page.goto(url);

await check('records an entry with auto-formatting', async () => {
  await record('two swimmers outside the flags');
  const texts = await entryTexts();
  assert(texts.at(-1) === 'Two swimmers outside the flags.', `got ${JSON.stringify(texts)}`);
});

await check('entries persist across reload', async () => {
  await record('rip forming north end');
  await page.reload();
  const texts = await entryTexts();
  assert(texts.length === 2, `expected 2 entries after reload, got ${texts.length}`);
});

await check('swipe deletes an entry', async () => {
  const card = await page.$('.log-entry');
  const box = await card.boundingBox();
  const y = box.y + box.height / 2;
  await card.dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: box.x + 20, clientY: y }] });
  await card.dispatchEvent('touchmove', { touches: [{ identifier: 0, clientX: box.x + 160, clientY: y }] });
  await card.dispatchEvent('touchend', { touches: [] });
  await page.waitForTimeout(400);
  assert((await entryTexts()).length === 1, 'entry not deleted');
});

await check('end of shift downloads a report', async () => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#report-btn')]);
  const body = await readFile(await download.path(), 'utf8');
  assert(body.includes('Rip forming north end.'), 'report missing entry text');
});

await check('new patrol clears the log', async () => {
  await page.click('#new-patrol-btn');
  assert((await entryTexts()).length === 0, 'log not cleared');
  assert(await page.evaluate(() => localStorage.getItem('surfPatrolLogs')) === null, 'storage not cleared');
});

await check('keeps transcript when browser ends recognition itself', async () => {
  await page.click('#dictate-btn');
  await page.waitForFunction(() => window.__speech.active);
  await page.evaluate(() => { window.__speech.say('patient conscious and breathing'); window.__speech.autoEnd(); });
  await page.waitForTimeout(100);
  const texts = await entryTexts();
  assert(texts.includes('Patient conscious and breathing.'), 'transcript discarded on unexpected onend (known bug)');
});

await check('no uncaught page errors', async () => {
  assert(errors.length === 0, errors.join('; '));
});

const shotDir = await mkdtemp(join(process.env.CLAUDE_SCRATCH || tmpdir(), 'smoke-'));
await page.screenshot({ path: join(shotDir, 'smoke.png') });
await browser.close();
server.close();

for (const [status, name, msg] of results) console.log(`${status}  ${name}${msg ? ` — ${msg}` : ''}`);
console.log(`\nScreenshot: ${join(shotDir, 'smoke.png')}`);
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);

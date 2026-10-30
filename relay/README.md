# Weather relay (Cloudflare Worker)

A small relay server that gives the app the BOM marine forecast and WillyWeather data. It's needed because:
- BOM blocks requests made from other websites, so the app can't fetch the forecast directly.
- The WillyWeather API key would be public if it were built into the app.

## Set up (about 10 minutes)

1. Sign in at https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**. Name it `sr30-relay` → **Deploy**.
2. **Edit code** → delete the sample → paste all of `relay/worker.js` → **Deploy**.
3. **Settings → Variables and Secrets → Add**:
   - Type **Secret**, name `WW_API_KEY`, value = your WillyWeather key.
   - (Optional) `WW_LOCATION_ID` if WillyWeather's search doesn't find Malabar.
4. Copy the worker URL (like `https://sr30-relay.<you>.workers.dev`) and paste it into `config.js` as `relayUrl`.
5. Check it works by opening `<worker URL>/bom` and `<worker URL>/ww` in a browser. Each should show JSON.

Responses are cached for 30 minutes (BOM) and 15 minutes (WillyWeather), so the APIs are called at most a few hundred times a day, whatever the number of crew phones. Cloudflare's free plan covers this.

BOM's copyright allows personal use and use within an organisation. Don't republish the data outside the club.

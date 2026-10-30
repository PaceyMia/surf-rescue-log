/* ── Surf Patrol Log – config.js ──
   relayUrl: the Cloudflare Worker in relay/ that fetches the BOM marine
   forecast and WillyWeather data (keeps the WillyWeather key secret).
   Leave empty until it's deployed — the Weather tab still shows the
   free model forecast and live map without it.
*/
const APP_CONFIG = {
  relayUrl: '',
  // Forecast point just offshore of Malabar, inside the patrol area
  forecastPoint: { lat: -33.97, lon: 151.27, name: 'off Malabar' }
};

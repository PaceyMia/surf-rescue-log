/* ── Surf Patrol Log – config.js ──
   dataUrl: weather.json published every 30 minutes by the "Weather data"
   GitHub workflow (BOM forecasts and warnings, WillyWeather when the
   WW_API_KEY repo secret is set). The model forecast and live maps work
   without it.
*/
const APP_CONFIG = {
  dataUrl: 'https://raw.githubusercontent.com/PaceyMia/surf-rescue-log/weather-data/weather.json',
  // Forecast point just offshore of Malabar, inside the patrol area
  forecastPoint: { lat: -33.97, lon: 151.27, name: 'off Malabar' }
};

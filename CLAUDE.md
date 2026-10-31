# Surf Rescue 30 — Patrol Log

Mobile-first voice log and toolkit for the Surf Rescue 30 offshore rescue boat (Malabar, Sydney). Plain HTML/CSS/JS served as static files (GitHub Pages). No build step, no framework, no server. BOM and WillyWeather data come from a scheduled GitHub workflow that publishes `weather.json` to the `weather-data` branch.

## Constraints that drive every change
- **Used on a boat.** Direct sunlight (high contrast only), wet fingers (≥48px targets, every swipe has a button equivalent), patchy signal.
- **Must never lose an entry.** Recording saves a draft as words arrive; entries, shift and draft live in localStorage and survive reloads, screen lock and the app being closed.
- **Devices:** mix of iPhone and Android, plus an iPad on the boat. Check layouts at 390px and 820px wide.
- `en-AU` speech, Australian spelling, 24-hour times in the log.

## Files
| File | Role |
|---|---|
| `index.html` / `style.css` | Start screen, tabs (Log, Weather, Tools, Info), edit dialog. The page scrolls; the red/yellow header scrolls away and `#sticky-top` (tabs + boundary bar) stays pinned; the mic footer is sticky at the bottom |
| `script.js` | Log, shift/crew, recording, tabs, report |
| `vocab.js` | Transcript clean-up: place names, mishearings, marine terms, 12/24h times. Phrase hints for Chrome |
| `places.js` | Generated place list (Central Coast → Illawarra) with OSM coordinates; `confirmed:false` = nickname for the skipper to check |
| `geo.js` | DDM/DMS formatting, distance/bearing, nearest landmark, position parsing |
| `coast.js` | Generated coastline + outcrops (South Head → Cape Baily), pre-computed 2 NM / warning lines, and the navigable-water grid for routing |
| `geofence.js` | 2 NM boundary alarm (watchPosition) and SVG map |
| `route.js` | Job route by water (A* on the navigable grid, ≥100 m off land), courses, time at speed, route map |
| `setup.js` | Phone setup check: mic / location / notification permissions with one-tap request |
| `weather.js` | Warnings (badge + Log banner), BOM forecast and WillyWeather from `weather.json`; Open-Meteo now tiles, tide, 24 h strip; sun/first/last light computed locally; wind units (kn/km/h) remembered; Windy (wind, waves) and RainViewer radar (auto-play) maps, one iframe per layer |
| `tools.js` | Speed/distance/time, position & bearing, fuel range (rule of thirds) |
| `config.js` | `dataUrl` (raw URL of `weather.json`), forecast point |
| `sw.js` / `manifest.webmanifest` / `icons/` | App shell cache (network-first), Home Screen install |
| `.github/workflows/weather-data.yml` + `data-scripts/fetch_weather.mjs` | Every 30 min: BOM coastal/local waters forecasts and current NSW warning products via BOM's anonymous FTP, WillyWeather via API (repo secret `WW_API_KEY`), published to the `weather-data` branch |
| `data-scripts/` | Regenerate `places.js` and `coast.js` from OpenStreetMap; build `weather.json` |

Storage keys: `surfPatrolLogs`, `surfPatrolShift`, `surfPatrolCrewNames`, `surfPatrolDraft`, `surfPatrolTab`, `surfPatrolBoundaryAlarm`, `surfPatrolFuel`, `surfPatrolUnits`, `surfPatrolRoute`, `surfPatrolWx` / `surfPatrolFeed` (weather caches).

When adding a file the app loads, add it to `SHELL` in `sw.js` and bump `CACHE`.

## Recording behaviour
The mic stays live until Stop is tapped. If the browser ends the session (silence, signal drop) it restarts and keeps the transcript; fatal errors (`not-allowed`, `audio-capture`) or >12 restarts in 30 s save what was heard and stop. Entries are timestamped at the start of recording and get a GPS position if available.

## Known gaps (Oct 2026)
- Dictation needs signal (Chrome/Safari speech is server-based). The app itself opens offline.
- iOS Safari speech in continuous mode is untested on a real device; restarts may need a tap.
- The boundary alarm only runs while the app is open on screen (web apps get no background GPS). Notifications on iPhone/iPad need the app added to the Home Screen.
- Boundary data covers South Head → Cape Baily only; Botany Bay interior is excluded (all within 2 NM).
- BOM's website refuses automated requests; only use the FTP service for BOM files. Don't spoof a browser user agent.
- BOM warning products (IDN2xxxx) are parsed for their titles only; `raw-warnings/` on the weather-data branch holds samples while the parser is refined.
- WillyWeather field names in `fetch_weather.mjs` need checking against the first live response once `WW_API_KEY` is set.
- Tide is a model estimate (Open-Meteo sea level) until WillyWeather tides are available.

## Stakeholder app guide
An annotated walkthrough of every screen lives at https://claude.ai/artifact/KcQsu3EAdzrB7qeMDWwYVr (owner: Mia). Keep it current: after any UI change, update the matching entry in `docs/guide/components.mjs` (what / how to use / data / note), then

    node docs/guide/build-guide.mjs <scratchpad>/app-guide.html

and republish that file to the same artifact. The generator drives the real app with example data, screenshots each screen and places the numbered markers by measuring each component's selector; it warns about any selector it can't find.

## Verifying changes
Speech can't be driven in headless Chromium, so the smoke test injects a fake `SpeechRecognition`, fake GPS, and mocked weather/relay responses:

    node .claude/skills/verify-app/scripts/smoke.mjs

Use the `verify-app` skill for the full procedure.

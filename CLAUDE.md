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
| `route.js` | Job route by water (A* on the navigable grid; 50 m off land, 25 m in estuaries), searchable From/To pickers, courses, time at speed, route map |
| `setup.js` | Phone setup check: mic / location / notification permissions with one-tap request |
| `weather.js` | Sydney-only warnings (badge + Log banner) and Sydney Coast BOM forecast from `weather.json`; Open-Meteo now tiles, tide ("Near high/low" within the estimate's margin), 24 h strip; sun/first/last light computed locally; wind units (kn/km/h) remembered; Windy wind/waves/radar maps loaded only when scrolled to, one iframe per layer; data prefetched at start-up and a loading screen until it's in |
| `tools.js` | Speed/distance/time calculator, fuel range (rule of thirds) |
| `config.js` | `dataUrl` (raw URL of `weather.json`), forecast point |
| `sw.js` / `manifest.webmanifest` / `icons/` | App shell cache (network-first), Home Screen install |
| `.github/workflows/weather-data.yml` + `data-scripts/fetch_weather.mjs` | Every 30 min: BOM coastal/local waters forecasts and current NSW warning products via BOM's anonymous FTP, WillyWeather via API (repo secret `WW_API_KEY`), published to the `weather-data` branch |
| `data-scripts/` | Regenerate `places.js` and `coast.js` from OpenStreetMap; build `weather.json` |

Storage keys: `surfPatrolLogs`, `surfPatrolShift`, `surfPatrolCrewNames`, `surfPatrolDraft`, `surfPatrolTab`, `surfPatrolBoundaryAlarm`, `surfPatrolFuel`, `surfPatrolUnits`, `surfPatrolRoute`, `surfPatrolWx` / `surfPatrolFeed` (weather caches).

When adding a file the app loads, add it to `SHELL` in `sw.js` and bump `CACHE`.

## Recording behaviour
Push to talk: one tap starts one recognition session, the next tap stops and saves it. Never restart sessions automatically — on Android every start plays the phone's tone and re-sends earlier words. The transcript is rebuilt from the session's full `event.results` on every event and merged so Android's cumulative results ("departing", "departing Botany", …) don't repeat. If the phone ends the session itself (long silence), what was heard is saved and the button offers "Continue entry" for 60 s, which appends to that same entry. Entries are timestamped at the start of recording and get a GPS position if available.

## Known gaps (Oct 2026)
- Dictation needs signal (Chrome/Safari speech is server-based). The app itself opens offline.
- iOS Safari speech in continuous mode is untested on a real device; restarts may need a tap.
- The boundary alarm only runs while the app is open on screen (web apps get no background GPS). Notifications on iPhone/iPad need the app added to the Home Screen.
- Boundary data covers South Head → Cape Baily only; Botany Bay interior is excluded (all within 2 NM).
- BOM's website refuses automated requests; only use the FTP service for BOM files. Don't spoof a browser user agent.
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

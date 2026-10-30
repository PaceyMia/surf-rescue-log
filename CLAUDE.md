# Surf Rescue 30 — Patrol Log

Mobile-first voice log and toolkit for the Surf Rescue 30 offshore rescue boat (Malabar, Sydney). Plain HTML/CSS/JS served as static files (GitHub Pages). No build step, no framework. The only server piece is the optional weather relay in `relay/` (Cloudflare Worker).

## Constraints that drive every change
- **Used on a boat.** Direct sunlight (high contrast only), wet fingers (≥48px targets, every swipe has a button equivalent), patchy signal.
- **Must never lose an entry.** Recording saves a draft as words arrive; entries, shift and draft live in localStorage and survive reloads, screen lock and the app being closed.
- **Devices:** mix of iPhone and Android, plus an iPad on the boat. Check layouts at 390px and 820px wide.
- `en-AU` speech, Australian spelling, 24-hour times in the log.

## Files
| File | Role |
|---|---|
| `index.html` / `style.css` | Start screen, tabs (Log, Weather, Tools, Info), edit dialog |
| `script.js` | Log, shift/crew, recording, tabs, report |
| `vocab.js` | Transcript clean-up: place names, mishearings, marine terms, 12/24h times. Phrase hints for Chrome |
| `places.js` | Generated place list (Central Coast → Illawarra) with OSM coordinates; `confirmed:false` = nickname for the skipper to check |
| `geo.js` | DDM/DMS formatting, distance/bearing, nearest landmark, position parsing |
| `coast.js` | Generated coastline + outcrops (South Head → Cape Baily) and pre-computed 2 NM / warning lines |
| `geofence.js` | 2 NM boundary alarm (watchPosition) and SVG map |
| `weather.js` | Open-Meteo forecast (direct), BOM + WillyWeather (via relay), Windy map, cached last-good data |
| `tools.js` | Speed/distance/time, position & bearing, fuel range (rule of thirds) |
| `config.js` | `relayUrl` (empty until the Worker is deployed) |
| `sw.js` / `manifest.webmanifest` / `icons/` | App shell cache (network-first), Home Screen install |
| `relay/` | Cloudflare Worker for BOM XML + WillyWeather (keeps the key secret) |
| `data-scripts/` | Regenerate `places.js` and `coast.js` from OpenStreetMap |

Storage keys: `surfPatrolLogs`, `surfPatrolShift`, `surfPatrolCrewNames`, `surfPatrolDraft`, `surfPatrolTab`, `surfPatrolBoundaryAlarm`, `surfPatrolFuel`, `surfPatrolWx/Bom/Ww` (weather caches).

When adding a file the app loads, add it to `SHELL` in `sw.js` and bump `CACHE`.

## Recording behaviour
The mic stays live until Stop is tapped. If the browser ends the session (silence, signal drop) it restarts and keeps the transcript; fatal errors (`not-allowed`, `audio-capture`) or >12 restarts in 30 s save what was heard and stop. Entries are timestamped at the start of recording and get a GPS position if available.

## Known gaps (Oct 2026)
- Dictation needs signal (Chrome/Safari speech is server-based). The app itself opens offline.
- iOS Safari speech in continuous mode is untested on a real device; restarts may need a tap.
- The boundary alarm only runs while the app is open on screen (web apps get no background GPS). Notifications on iPhone/iPad need the app added to the Home Screen.
- Boundary data covers South Head → Cape Baily only; Botany Bay interior is excluded (all within 2 NM).
- The relay isn't deployed yet; WillyWeather field names in `relay/worker.js` need checking against live responses.

## Verifying changes
Speech can't be driven in headless Chromium, so the smoke test injects a fake `SpeechRecognition`, fake GPS, and mocked weather/relay responses:

    node .claude/skills/verify-app/scripts/smoke.mjs

Use the `verify-app` skill for the full procedure.

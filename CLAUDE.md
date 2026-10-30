# Surf Rescue 30 — Patrol Log

Single-page, mobile-first voice log for surf lifesaving patrols. Plain HTML/CSS/JS: `index.html`, `style.css`, `script.js`. No build step, no dependencies, no backend.

## Constraints that drive every change
- **Used on a beach.** Direct sunlight (high contrast only), wet/sandy fingers (large tap targets, no precision gestures), patchy or no signal.
- **Must never lose an entry.** Any change touching recording, storage, or delete must preserve data on screen lock, reload, app switch, and unexpected recognition end.
- **No framework or bundler** unless a requirement genuinely can't be met without one. Keep it deployable as static files (GitHub Pages).
- Speech recognition locale is `en-AU`. Australian spelling in UI copy.

## App flow
1. **Start screen** (`#start-screen`): duty pills (Patrol default / Training / Other → text box), patrol date (local date, never `toISOString()`), crew with award codes matching the paper Patrol Operations Log — S skipper and D driver required, up to 3 optional C crew. Names are remembered for autocomplete. No times on/off; those are filled in afterwards.
2. **Log screen**: tap the shift summary to edit crew without losing entries. New Patrol clears entries and shift and returns to the start screen.

Storage keys: `surfPatrolLogs` (entries), `surfPatrolShift` (duty/date/crew), `surfPatrolCrewNames` (autocomplete).

Devices: a mix of iPhone and Android, plus an iPad on the boat — check layouts at 390px and 820px wide.

## Known gaps (as of Oct 2026)
- Web Speech API in Chrome is server-based — dictation needs network. README's "no internet" claim is inaccurate.
- No web manifest / service worker, so the page itself isn't available offline.
- Storage is `localStorage` only; Safari evicts it after 7 days for non-installed sites.
- No way to edit an entry; delete is touch-swipe only (no mouse/keyboard path).

## Verifying changes
Speech can't be driven in headless Chromium, so the smoke test injects a fake `SpeechRecognition`. Run it after any change to `script.js` or `index.html`:

    node .claude/skills/verify-app/scripts/smoke.mjs

Use the `verify-app` skill for the full procedure.

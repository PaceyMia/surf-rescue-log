---
name: verify-app
description: Run the patrol log in headless Chromium with a mocked SpeechRecognition and check recording, persistence, delete, new-patrol and report export still work. Use after any change to index.html, script.js or style.css, or when asked to test/verify the app.
allowed-tools: Bash(node .claude/skills/verify-app/scripts/*)
---

## Objective
Prove the core patrol flow works end to end in a real browser, at phone size.

## Process
1. Run `node .claude/skills/verify-app/scripts/smoke.mjs`. It serves the repo on a local port, loads it at 390×844, and injects a fake `SpeechRecognition` (`window.__speech.say(text)`, `window.__speech.autoEnd()`).
2. If a check fails, read the failing assertion, fix the app (not the test), and rerun.
3. If you changed behaviour the script doesn't cover (e.g. editing entries, offline mode), add a check to `smoke.mjs` in the same style before calling the work done.
4. For visual changes, the script writes `smoke.png` to the scratch dir it prints — look at it.

## Constraints
- Never weaken or delete an existing check to get green.
- The mock is not real speech: say so when reporting, and flag anything that needs on-device testing (iOS Safari, Android Chrome, screen lock).

## Output
Pass/fail per check, the screenshot path, and any behaviour that still needs a real phone.

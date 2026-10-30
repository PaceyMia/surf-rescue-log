---
name: implement-ui
description: Implement or change UI in the patrol log (buttons, log list, entry editing, dialogs, layout). Use for any change to index.html or style.css, or UI behaviour in script.js.
argument-hint: "<what to change>"
---

## Objective
Implement: $ARGUMENTS

## Required context
Read `CLAUDE.md`, then the relevant parts of `index.html`, `style.css`, `script.js`.

## Process
1. Keep vanilla HTML/CSS/JS. Reuse existing CSS variables/colours and the section-comment style in `script.js`.
2. Design for the beach: tap targets ≥ 48px, WCAG AA contrast minimum (aim AAA for primary controls), no hover-only affordances, no gestures as the only way to do something — every swipe needs a button/keyboard equivalent.
3. Replace native `confirm()`/`alert()` only if asked; if you add a dialog, use `<dialog>` with focus management.
4. Keep the one-screen layout (`100dvh`, only the log scrolls). Check at 360px and 430px widths.
5. Announce state changes (recording started/stopped, saved, deleted) via the existing `aria-live` region or `#status-msg`.
6. Run the `verify-app` skill; extend its checks to cover the new behaviour.

## Constraints
- No new dependencies or build tooling.
- Do not change the storage format without a migration that reads the old `surfPatrolLogs` shape.

## Output
What changed, screenshot path from verify-app, and anything needing on-device testing.

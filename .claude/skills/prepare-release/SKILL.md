---
name: prepare-release
description: Prepare a release of the patrol log for GitHub Pages — verify, bump the service-worker cache version if one exists, update README, draft notes. Does not push or deploy.
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(node .claude/skills/verify-app/scripts/*)
---

## Objective
Get the current branch ready to ship, without shipping it.

## Process
1. `git status` / `git log main..HEAD` — summarise what's changing.
2. Run the `verify-app` smoke test; stop if it fails.
3. If a service worker exists, bump its cache name so phones pick up the new files.
4. Check README claims (offline support, browser table, features) still match the code. Fix inaccuracies.
5. Draft release notes in plain language a patrol member would understand.

## Constraints
- Do not push, tag, or deploy. Hand the notes back for the user to approve.

## Output
Change summary, verification result, README edits made, draft release notes.

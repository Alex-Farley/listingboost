---
id: "{{ID}}"
stage: plan
status: draft
spec: spec.md
risk: routine          # routine (engineer approves) | higher (tech lead approves)
branch: "sdlc/{{ID}}-{{SLUG}}"
---

# Plan: {{TITLE}}

## Files changing
| Path | Change | Requirement |
|------|--------|-------------|

## Test strategy
<!-- Most tests fast and low level (unit), fewer integration tests, a few end-to-end journeys.
     Contract tests where we call, or are called by, another service. Accessibility checks for UI.
     UX checks for UI (sdlc-ux-review): changed flows to check with existing browser tests or manually, and
     input-variant tests for any changed validation. -->

## Order of work (test-driven: red, green, refactor for every step)
| Step | Behaviour (AC) | Test first: name, file, type (unit/integration/e2e/contract) | Code change |
|------|----------------|---------------------------------------------------------------|-------------|
| 1    | AC1            |                                                               |             |
<!-- Steps with no meaningful automated test (pure config, copy, infrastructure): say why and give
     the manual or other proof instead. -->

## Release strategy
<!-- direct | feature flag. Use a flag when the change is large, risky, or user-facing and you want
     to merge in small slices. Flag: name, default OFF, owner, removal date. -->
- Strategy:

## Risks and alternatives
-

## Can run in parallel
<!-- Independent steps that could use separate worktrees, or "none". -->

## Questions a reviewer should ask
1.

<!-- Deviations during build are logged in verify.md, not here: this file is fixed once approved. -->

---
id: "{{ID}}"
stage: verify
status: draft          # draft | ready-for-review
---

# Verify: {{TITLE}}

## Verify command
```
$ bun run verify
<paste the real output summary here>
```

## Acceptance criteria and TDD evidence
<!-- For each AC: the test, and the tdd.log entries showing it failed (RED) before the code and
     passed (GREEN) after. A test that was never seen failing is weaker evidence: say so. -->
| AC | Test | RED seen (tdd.log time) | GREEN seen | Result |
|----|------|-------------------------|------------|--------|

## UX checks (only if the change touches UI; see sdlc-ux-review)
<!-- One row per changed page. Method: existing automated browser check, manual or visual.
     Every flag is fixed or accepted with a reason. Or "no UI change". -->
| Page | Method | Flags | Fixed / accepted (reason) |
|------|--------|-------|---------------------------|

## Refactoring done
<!-- What was tidied with tests green, or "none needed". -->

## Deviations from the plan
<!-- Files changed that the plan did not list, steps done differently, and why. Or "none". -->

## Evals added
<!-- evals/cases/... or "none (not a bug fix)". -->

## Manual checks for the reviewer
1.

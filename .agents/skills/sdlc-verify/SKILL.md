---
name: sdlc-verify
description: Stage 4 (Test). Proves the build meets the spec before any human reviews it - runs the verify command, checks every acceptance criterion, pastes real output into verify.md, and adds regression evals. Use after the build stage, or when someone says "verify", "test it", "is it done" or "prove it works".
---

# Stage 4 - verify before a human looks

The rule: **the agent checks its own work, with evidence, before asking a person to review it.**
"I think it works" is not evidence. Command output is.

## Steps

1. **Run the verify command** (`bun run verify`; `scripts/sdlc verify` delegates to it via `.sdlc/config`).
   All must pass. Never skip, delete, weaken or mark a failing test as pending to get green.
2. **If anything fails, go back to build**, fix it, and run again. Repeat until green or until you
   have tried twice without progress, then stop and explain.
3. **Check each acceptance criterion** in `spec.md`. For each one record the test that proves it
   and the TDD evidence from `work/NNN-slug/tdd.log`: when it was seen RED (failing, before the
   code) and when GREEN. If a test was never seen failing, say so plainly: it is weaker evidence.
   If a criterion has no proof, write a test, or mark it as a manual check with exact steps.
   Note any refactoring done.
   **UX checks** (only if the change touches UI): follow `sdlc-ux-review` and record the
   existing automated browser check or manual steps for each changed flow. Do not assume the
   optional upstream `scripts/ux-check.mjs` is installed.
4. **Check the diff matches the plan.** List any file changed that the plan did not mention, and
   anything done differently, under "Deviations from the plan" in verify.md.
5. **Write `verify.md`** from `.sdlc/templates/verify.md`, pasting the **actual command output** (trimmed to
   the summary lines if long).
6. **Add an eval if this was a bug fix or incident.** Copy `evals/cases/_template.md` to
   `evals/cases/NNN-slug.md` so the same class of problem is checked every time the agent's
   instructions change.
7. **Hand over.** Set verify.md to `status: ready-for-review` and move to the review stage.
   (This is the one status you may set yourself: it is backed by the pasted output, and the PR
   review checks it.)

## What counts as proof

- A test that fails without the change and passes with it
- Build and lint with zero errors and zero new warnings
- For UI: a screenshot compared against the design, plus an accessibility check (e.g. axe) with
  zero serious issues, plus the UX checks table
- For anything not automatable: numbered manual steps a reviewer can follow in under five minutes

---
name: sdlc-plan
description: Stage 3a (Build - plan first). Read-only planning pass that turns an approved spec.md into plan.md - which files change, in what order, the risks, and how each step will be proved. Use when the spec is approved and someone says "plan the build", "plan mode" or "next stage". No code is written in this stage.
---

# Stage 3a - plan before code

Work in **read-only mode**. If your tool has a plan mode (Claude Code, Cursor, Codex and others do),
use it. Otherwise, simply do not edit any file except `plan.md`.

## Before you start

- Check `work/NNN-slug/spec.md` has `status: approved`. If not, stop.
- Read `AGENTS.md` for conventions and verify commands.

## Steps

1. **Read spec.md and the code it touches.** Trace each requirement to the files involved.
2. **Write `plan.md`** from `.sdlc/templates/plan.md`:
   - **Files changing**: path, what changes, which requirement (R1...) it serves
   - **Test strategy**: mostly fast unit tests, fewer integration tests, a few end-to-end journeys;
     contract tests where we call or are called by another service; accessibility checks for UI.
     For UI, include a manual or existing automated browser check for each changed flow, plus
     input-variant unit tests for any validation that changes. UX acceptance criteria get
     red-green steps like any other. Do not assume an upstream UX-check script is installed.
   - **Order of work, test first**: small steps, each a red-green-refactor cycle. For each step name
     the behaviour (AC), the test to write first (name, file, type) and the code change. Every
     acceptance criterion maps to at least one test. If a step has no sensible automated test,
     say why and give the other proof.
   - **Release strategy**: direct, or behind a feature flag (name, default OFF, owner, removal
     date) when the change is large, risky or user-facing and should merge in small slices.
   - **Risks and alternatives**: what could go wrong, what you considered and rejected
   - **Risk level**: `routine` (engineer approves) or `higher` (tech lead approves). Higher if it
     touches auth, payments, personal data, migrations, infrastructure, protected paths, or
     anything a `policy-*` skill marks as higher risk (e.g. clinical safety, money movement).
   - **Parallel work**: if steps are independent, say which could run in separate branches/worktrees
3. **Invite challenge.** End by listing the two or three questions you would want a reviewer to ask.
4. **Stop at the gate.** Leave `status: draft`. The engineer (routine) or tech lead (higher) approves:
   `scripts/sdlc approve work/NNN-slug plan`.

## Good plans are

- Small enough to review in ten minutes
- Honest about uncertainty ("I have not found where X is configured; step 2 starts by checking")
- Testable: no step without a proof

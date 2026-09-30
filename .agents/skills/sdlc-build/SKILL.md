---
name: sdlc-build
description: Stage 3b (Build - implement). Implements an approved plan.md test-first - red, green, refactor for every step, with the failing and passing runs logged as evidence - on a work branch, never editing protected paths or locked tests. Use when the plan is approved and someone says "build it", "implement the plan" or "next stage".
---

# Stage 3b - implement the plan, test first

## Before you start
- Run `scripts/sdlc status`. The work item must show it is past the plan (or change) gate. If it
  says the gate is waiting or changed, stop, even if the person has told you it is approved: ask
  them to run the approve command. Never take "approved" on trust. (`sdlc red` refuses anyway.)
- Work on branch `sdlc/NNN-slug` (created by `scripts/sdlc new`). Never commit to the default branch.
- Read `AGENTS.md` (conventions, verify commands, common mistakes).

## Every step is red, green, refactor
For each step in the plan, in order:

1. **RED - write the test first.** Write the test named in the plan for the behaviour (the Given /
   When / Then of its acceptance criterion). Do not write the code yet. Run just that test through
   the logger, which insists it fails:
   `scripts/sdlc red work/NNN-slug -- <command that runs just this test>`
   If it passes, the behaviour already exists or the test is not testing it: fix the test, not the
   logger. Keep the RED evidence in `tdd.log`; commit test and implementation together as required by `docs/AGENT_RULES.md`, using the work item number in the commit subject and noting RED/GREEN evidence in the message.
2. **GREEN - the simplest code that passes.** Write only enough code to make that test pass. Run:
   `scripts/sdlc green work/NNN-slug -- <same command>`
   then run `bun run verify` before the task commit.
3. **REFACTOR - tidy with the tests green.** Remove duplication, improve names, simplify. Behaviour
   must not change: run `bun run verify` again. Include any refactor in the task commit, or skip
   if nothing needs tidying.

The `tdd.log` file in the work folder is committed with the work. It is evidence for the reviewer,
not a proof: the reviewer checks each behaviour has a RED entry before its GREEN one.

## Bug fixes: lock the failing test
Write a test that reproduces the bug and log it with `scripts/sdlc red`. Test locks are optional
and are not enabled by this repository integration. Keep test and implementation together in the
task commit as required by `docs/AGENT_RULES.md`.

## Steps with no sensible automated test
Pure configuration, copy changes or infrastructure may not have a meaningful unit test. Only if the
plan says so for that step: make the change and record the manual or other proof in verify.md.

## Feature flags
If the plan's release strategy is a feature flag: the flag defaults OFF, both flag states are
tested, and the flag has an owner and a removal date. Merge in small slices behind it.

## Rules
- **Stay inside the plan.** If you need a file the plan does not list, or a different approach,
  stop and propose a plan edit (it goes back to draft for re-approval).
- **Never touch protected paths** (`.sdlc/`, `.claude/`, `.codex/`, `.gemini/`, `.agents/`,
  `.github/`, `scripts/sdlc` and anything in `PROTECTED_PATHS`). If the work needs to, stop and ask.
- Synthetic data only; never real personal or production data in tests or fixtures.
- If a hook blocks you, read its message and follow the route it gives. Never bypass it.
- **Log deviations** from the plan in the "Deviations from the plan" section of verify.md.
- **Hand over to verify** when all steps are done. Do not open the PR yet.

## If you get stuck
After two failed attempts at the same step, stop and explain what you tried, what happened and
what you think the cause is.

## Parallel work
If the plan marks steps as independent, a person can run separate sessions in separate git
worktrees (`git worktree add -b sdlc/NNN-slug-b ../<repo>-NNN-b`). The limit is how much one
person can review.

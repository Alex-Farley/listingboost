---
id: "005"
title: "Fix intermittent UI test timeouts"
stage: change
route: small
status: approved
risk: routine
branch: "sdlc/005-flaky-ui-waits"
created: "2026-10-05"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T07:43:22Z"
approved_sha256: 3219c5ccf7e2f686878982c6f892335e91016cf22158dd6cb8a8a394b5f4bea0
---

# Small change: Fix intermittent UI test timeouts

<!-- Small-change route: intent, spec and plan in one short file with one approval.
     Only for changes that are ALL of: routine risk, about a day's work or less, no new or changed
     personal data, no auth/payments/infrastructure/migrations, no protected paths, and no
     policy-* flag. If any of these is not true, use the full route (scripts/sdlc new <slug>). -->

## Why (problem and evidence)
UI tests fail intermittently by timing out, not by finding a wrong result, and a failure
blocks merging until CI is re-run:

- `tests/ui/auth.test.tsx` "signing out ends the session": timed out at 5,000 ms in 2 of 6 local
  runs of `bun test tests/ui` on 2026-10-02, before work item 001 changed any code, and in four
  full local runs during that build. It passes on its own every time (3 of 3).
- `tests/ui/listings.test.tsx` "listing overview > editing facts saves them": timed out at
  5,023 ms on GitHub Actions (run 37278437817, 2026-10-05) waiting for the "Edit facts" button.
  The run before it, on identical code, passed; 5 of 5 local runs of the UI suite passed.

- `tests/ui/campaign.test.tsx` "campaign creation and generation progress > creating a campaign
  shows the progress checklist": timed out at 5,020 ms in the CI run on `main` for commit
  `bb8553c` (run 36751647854, 2026-09-30), before work item 001 existed.

All three are the same failure: a wait that gives up after 5 seconds. So the problem is in how
the UI suite waits generally, not in one test, and the fix should be checked against the whole
suite.

All these waits use Testing Library's `asyncUtilTimeout` of 5,000 ms (`tests/ui/harness.tsx:31`). Why
the page sometimes takes longer than that is not yet known: it may be load on the runner, or a
missing await or `act()` warning in the tests (React prints "not wrapped in act(...)" warnings in
`tests/ui/auth.test.tsx` runs). Work item 001 added 21 UI tests, which may have made it more
frequent; that is a guess, not measured.

## What changes (and what does not)
Changes: the UI test harness and, where the cause is in a test, that test's waiting code. If a
real ordering bug in the client is found (a page acting before its data is loaded), it is fixed in
the client with a test.

Does not change: any assertion. A test's Given / When / Then stays as it is. No test is skipped,
retried automatically, or deleted. Raising the timeout alone is not an acceptable fix unless the
investigation shows the work is legitimately slow under load, and then only with that evidence
recorded here.

## Acceptance criteria (Given / When / Then)
| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | The UI suite under CPU load comparable to a CI runner (for example run with other test suites in parallel) | It is run 30 times | Every test passes every time, where today at least one of the three fails within 30 runs |
| AC2 | The fix is in | `bun run verify` runs, and CI runs on the PR | Everything passes, with no test skipped, weakened or marked as retried |
| AC3 | The cause has been investigated | The change is reviewed | change.md or verify.md records the cause found, with the evidence, or states that none was found and why the chosen fix is still sound |

## Plan (test first: red, green, refactor)
| Step | Test first (name, file) | Code change |
|------|-------------------------|-------------|
| 1 | Reproduce: a script that runs `bun test tests/ui` 30 times under load and counts failures. Record the failing count as RED. | None. The script lives in the work folder or the scratch area, not in the product. |
| 2 | Same script | Investigate both tests: act() warnings, missing awaits, the sign-out navigation and the overview load. Fix the cause in the test or client code. |
| 3 | Same script, 30 runs, zero failures: GREEN. Then `bun run verify` and CI. | Only if step 2 finds no code cause: a justified timeout change in `tests/ui/harness.tsx`, with the timings that justify it. |

## Checks that this qualifies as small
- [x] Routine risk, about a day or less
- [x] No new or changed personal data
- [x] No auth, payments, infrastructure, migrations or protected paths. One of the tests covers
      sign-out, but the change is to test waiting, not to authentication code; if the cause turns
      out to be in auth code, this moves to the full route.
- [x] No policy concerns (no `policy-*` skills are installed)

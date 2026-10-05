---
id: "005"
stage: verify
status: ready-for-review   # draft | ready-for-review
---

# Verify: Fix intermittent UI test timeouts

## Verify command
```
$ scripts/sdlc verify        (2026-10-05, sdlc/005-flaky-ui-waits with main merged in)
$ bun test --timeout 30000 tests/unit tests/integration tests/security tests/ui
 741 pass
 0 fail
 7177 expect() calls
Ran 741 tests across 51 files. [70.36s]
Total Upload: 4793.16 KiB / gzip: 1584.58 KiB
sdlc verify: PASSED

$ bun run test:e2e          (workerd via wrangler dev, Chromium)
  ✓  1 AT-13 full journey: sign in → ... → download pack
  ✓  2 AT-22 brand settings ... render on workerd
  2 passed (25.0s)
```

## What the investigation found

The failures had three separate causes. Only the first was expected when the change was approved.

1. **Bun ignored the configured test timeout.** `bunfig.toml` set `timeout = 30000`, but Bun 1.3.11
   ignores that key and applies its 5 s default unless `--timeout` is passed. Proof: a test that
   sleeps 7 s fails at 5,002 ms when run plainly and passes with `--timeout 30000`. Fixed in the
   `package.json` test scripts, which CI and the deploy use. **On its own this fixed nothing
   measurable** (18 of 30 runs still failed), because the failures below are not slow tests.
2. **The sign-up, sign-in and sign-out actions each navigated twice.** The page already redirects
   when the session changes (`<Navigate>` in the auth pages, `RequireAuth` in the app shell), and
   each action also called `navigate()` itself. Under load the second navigation could land after
   the user had moved on, so signing out right after signing up could end on a blank
   `/app/listings` while signed out: the redirect away had already run and did not run again.
   Fixed by removing the extra `navigate()` in `Auth.tsx` (sign-in and sign-up) and `AppShell.tsx`
   (sign-out); the automatic redirects remain. Users see no change except that the race is gone.
3. **One test checked too early.** "protected pages redirect to sign-in" waited for the address to
   become `/signin` and then looked for the heading at once; under load React had not drawn the
   page yet. It now waits for the heading. Its assertion is unchanged.

## Acceptance criteria and evidence

| AC | Evidence | RED (tdd.log, UTC) | GREEN | Result |
|----|----------|--------------------|-------|--------|
| AC1 | `repro.sh 30 0,1`: the UI suite 30 times on 2 CPUs shared with the integration suite | 09:41:50, 10 of 30 runs failed (the suite before main was merged in) | 10:16:57, 0 of 30 failed (current suite, 52 tests) | pass |
| AC1 | `repro-auth.sh 10`: the sign-in tests 10 times on 1 shared CPU | 10:02:17, 10 of 10 failed | 10:05:17, 0 of 10 failed (and 0 of 20 in an earlier manual run) | pass |
| AC2 | `scripts/sdlc verify` and E2E above; no test skipped, retried or deleted | n/a | 2026-10-05 | pass |
| AC2 | `tests/unit/test-config.test.ts`: every `bun test` script sets `--timeout` ≥ 30 s, above the 5 s query wait | 09:44:32 | 09:44:32 | pass |
| AC3 | This file: the three causes, with how each was shown | n/a | n/a | pass |

The tdd.log entry at 09:58:37 is a GREEN attempt that failed (18 of 30): the timeout fix alone,
on the merged branch. It is kept as evidence that the timeout was not the main cause.

Not proven: the same numbers on GitHub's runners. The load here is synthetic (pinned CPUs plus a
competing test suite). CI on this PR, and the next deploys, are the real check.

## UX checks
No visible change. Sign-in, sign-up and sign-out land on the same pages as before; the E2E
journey covers sign-up, sign-out and sign-in on workerd.

## Refactoring done
None needed.

## Deviations from the plan
- **Client code changed, in the sign-in and sign-out pages.** The approved change.md says that if
  the cause turned out to be in auth code, this would move to the full route. The edits are to
  page navigation only (`apps/web/client/src/pages/Auth.tsx`, `AppShell.tsx`). Passwords,
  sessions, cookies and the server are untouched. The owner should confirm this still counts as a
  small change.
- **The fix is in `package.json`** (test scripts) and `bunfig.toml` (comment), not
  `tests/ui/harness.tsx`. The harness's 5 s query wait is unchanged.
- **A second reproduction script**, `repro-auth.sh`, was added because it fails in seconds rather
  than minutes.
- **`main` was merged into the branch** so the check covers the brand settings UI tests.

## Evals added
None. The guard test and the two reproduction scripts in this folder cover this class of problem.

## Manual checks for the reviewer
1. Sign up on the preview, then press Sign out straight away: you land on the sign-in page.
2. Sign in, then open `/app/listings` in a private window: you are sent to sign in.

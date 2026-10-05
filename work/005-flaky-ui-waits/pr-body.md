## Fix intermittent UI test timeouts (005)

**Change:** work/005-flaky-ui-waits/change.md
**Verify:** work/005-flaky-ui-waits/verify.md
**Review:** work/005-flaky-ui-waits/review.md

### What changed
- Sign-in, sign-up and sign-out no longer navigate twice. Each page already redirects when the session changes; the extra `navigate()` could land late and leave a signed-out user on a blank `/app/listings`.
- One test waits for the sign-in heading instead of checking before React has drawn it.
- Test scripts pass `--timeout 30000`: Bun 1.3 ignores the `timeout` key in `bunfig.toml` and was using 5 s.

### How it was verified
```
UI suite 30 times under load:     10 of 30 failed before, 0 of 30 after
Sign-in tests on one loaded CPU:  10 of 10 failed before, 0 of 10 after
$ scripts/sdlc verify   741 pass, 0 fail   sdlc verify: PASSED
$ bun run test:e2e      2 passed
```
The timeout fix alone left 18 of 30 runs failing; the double navigation was the main cause.

### Manual checks for the reviewer
1. Sign up on preview and press Sign out straight away: you land on the sign-in page.

### Risk
routine - client navigation and test configuration. **For you to confirm:** change.md said a cause in auth code would move this to the full route. The edits are to the sign-in and sign-out pages' navigation only; passwords, sessions, cookies and the server are untouched.

> Agent-assisted: written with Claude Code (Claude Opus 5.5). A person reviews and merges; the agent cannot approve or merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

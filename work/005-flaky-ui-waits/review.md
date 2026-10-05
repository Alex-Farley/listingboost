---
id: "005"
stage: review
status: draft          # draft | approved (human only)
pr: "https://github.com/Alex-Farley/listingboost/pull/162"
---

# Review: Fix intermittent UI test timeouts

Self-review, read-only pass over the diff against `docs/AGENT_RULES.md` and the approved change.md.

## Findings
| Severity | File:line | Finding | Why it matters | Suggested fix | Status |
|----------|-----------|---------|----------------|---------------|--------|
| important | `apps/web/client/src/pages/Auth.tsx`, `AppShell.tsx` | The cause was partly in the sign-in and sign-out pages, which change.md said would move the work to the full route. | The approval covered test-harness work; this is a small client change. | Owner confirms it still qualifies, or asks for the full route. | Open. Owner. |
| important | whole change | The reproduction uses synthetic load on this machine. | GitHub's runners may differ. | Watch CI on this PR and the next two deploys. | Open. |
| nit | `bunfig.toml` | The ignored `timeout` key is now only a comment explaining where the setting lives. | Someone could re-add it expecting it to work. | The guard test fails if a test script loses `--timeout`. | Accepted. |

No test assertion was weakened; one test now waits for an element instead of checking at once. No
instructions were found in the diff.

## Comment log

## Release
- Environment tier: staging (preview deploys on merge to `main`).
- Feature flag: none.
- Rollback steps (code): revert the merge commit.
- Rollback steps (database and data): n/a, nothing changes.
- Rollback rehearsed: no (not needed: client navigation and test configuration only).
- Production release approved by: product owner (Alex Farley).
- Deployment record: to be added after merge.

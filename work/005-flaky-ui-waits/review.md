---
id: "005"
stage: review
status: approved
pr: "https://github.com/Alex-Farley/listingboost/pull/162"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T10:31:00Z"
upstream_sha256: 6fde662d9d8725c7cabf63f2c56d6807d251d0a55ecb4e72a7051dca739deb9c
reviewed_commit: 1717144798e4aa0bcfe4604f718ccdb78a934381
approved_sha256: 4660ee46bbdf15189feca544de34d11b9d456795db2887a49ddc022741b9ef50
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

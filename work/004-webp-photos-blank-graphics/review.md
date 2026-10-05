---
id: "004"
stage: review
status: draft          # draft | approved (human only)
pr: ""
---

# Review: WebP property photos render as graphics with no photo

Self-review, read-only pass over the diff against `docs/AGENT_RULES.md`, the approved spec and plan.

## Findings
| Severity | File:line | Finding | Why it matters | Suggested fix | Status |
|----------|-----------|---------|----------------|---------------|--------|
| important | `tests/integration/template-renderer.test.ts` | The drawing-proof tests add about 40 s to every test run (36 extra renders). | Slower CI and deploys; more time under load. | Render one template per layout instead of all six, if the time matters. | Open. |
| important | three existing test files | Assertions about WebP photos changed (listed in verify.md). | AGENT_RULES forbids weakening tests; these follow the approved change in behaviour. | Read the three hunks. | Open. For the reviewer to confirm. |
| nit | `apps/web/client/src/pages/Images.tsx` | The notice on a stored WebP tile has not been looked at in a browser. | Layout on a narrow screen is unchecked. | Look at it on preview after merge. | Open. |

No instructions were found in the diff. No tenancy, auth or data handling changed.

## Comment log

## Release
- Environment tier: staging (preview deploys on merge to `main`).
- Feature flag: none.
- Rollback steps (code): revert the merge commit.
- Rollback steps (database and data): n/a, nothing changes.
- Rollback rehearsed: no (not needed).
- Production release approved by: product owner (Alex Farley).
- Deployment record: to be added after merge.

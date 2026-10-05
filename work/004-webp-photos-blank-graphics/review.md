---
id: "004"
stage: review
status: approved
pr: "https://github.com/Alex-Farley/listingboost/pull/163"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T12:58:09Z"
upstream_sha256: 6c3e7259b582db8195cc130f2493a6a0b2b17c75c8ca94da676d864363ce6d6b
reviewed_commit: 1f272785006f7d8620e4c5a3219bee7b97ed9c10
approved_sha256: a13f8143d55dabd2ce0e60743c18486a1b8ac123d16f5041cda2b362e06cd994
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

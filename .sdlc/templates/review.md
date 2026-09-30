---
id: "{{ID}}"
stage: review
status: draft          # draft | approved (human only)
pr: ""
---

# Review: {{TITLE}}

## Findings
| Severity | File:line | Finding | Why it matters | Suggested fix | Status |
|----------|-----------|---------|----------------|---------------|--------|

<!-- Severity: blocker | important | nit. Check AGENT_RULES, ARCHITECTURE, ACCEPTANCE_TESTS and the approved work artifacts. -->

## Comment log
<!-- Reviewer comment -> agent response -> commit -->

## Release
- Environment tier: dev | staging | production
- Feature flag: none | <name>, default OFF, owner, removal date; release = turning it on
- Rollback steps (code):
- Rollback steps (database and data - migrations, backfills; "n/a" only if nothing changes):
- Rollback rehearsed: yes | no
- Production release approved by: <owner/release approver named by repository policy, or n/a>
- Deployment record: <link to PR or deploy run when applicable>

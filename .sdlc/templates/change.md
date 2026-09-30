---
id: "{{ID}}"
title: "{{TITLE}}"
stage: change
route: small
status: draft          # draft | approved  (only a person changes this, via scripts/sdlc approve)
risk: routine
branch: "sdlc/{{ID}}-{{SLUG}}"
created: "{{DATE}}"
---

# Small change: {{TITLE}}

<!-- Small-change route: intent, spec and plan in one short file with one approval.
     Only for changes that are ALL of: routine risk, about a day's work or less, no new or changed
     personal data, no auth/payments/infrastructure/migrations, no protected paths, and no
     policy-* flag. If any of these is not true, use the full route (scripts/sdlc new <slug>). -->

## Why (problem and evidence)

## What changes (and what does not)

## Acceptance criteria (Given / When / Then)
| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | | | |

<!-- If users see or do anything different, include the sdlc-ux-review criteria that apply
     (e.g. one primary action, forgiving input) and plan the UX check. -->

## Plan (test first: red, green, refactor)
| Step | Test first (name, file) | Code change |
|------|-------------------------|-------------|
| 1    |                         |             |

## Checks that this qualifies as small
- [ ] Routine risk, about a day or less
- [ ] No new or changed personal data
- [ ] No auth, payments, infrastructure, migrations or protected paths
- [ ] No policy concerns

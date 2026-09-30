---
id: "{{ID}}"
title: "{{TITLE}}"
stage: incident-review
status: draft          # draft | published
severity: ""           # e.g. SEV1-SEV4, as the service defines it
created: "{{DATE}}"
---

# Incident review: {{TITLE}}

<!-- BLAMELESS. We look at how the system and our process made the failure possible, not at who did
     what wrong. People acted reasonably with the information they had. Name roles, not individuals.
     No personal data about users in this document. -->

## Summary
<!-- Three lines: what happened, who was affected, how long. -->

## Impact
- Users affected:
- Duration (detected -> restored):
- SLO error budget consumed: <e.g. 38% of the 28-day budget>
- Data affected: none | <describe, and whether the DPO was told>

## Timeline (UTC)
| Time | What happened | Source |
|------|---------------|--------|

## How we found out
<!-- Monitoring (which alert and tier), a user, a colleague? How could we have found out sooner? -->

## Contributing factors
<!-- Several, usually. Technical, process, and organisational. Ask "how did this make sense at the time?" -->
-

## What went well
-

## What was hard
-

## Actions
<!-- Each action becomes a work item (scripts/sdlc new ...) or an eval case. Owner = a role. -->
| Action | Type (fix / detect / prevent / process) | Owner | Work item or eval |
|--------|------------------------------------------|-------|-------------------|

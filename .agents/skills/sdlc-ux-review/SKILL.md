---
name: sdlc-ux-review
description: Review a ListingBoost interface change for cognitive load, clear progress, forgiving forms and honest user choices. Use from spec, plan, verification, review or maintenance work when a change affects the user interface.
---

# UX review

Use this as a focused heuristic review, not a substitute for accessibility testing
or research with estate agents. ListingBoost's design direction and trust rules in
`docs/MASTER_SPEC.md` remain authoritative.

Check each affected journey at desktop and mobile sizes where practical:

- Effort: is the next action easy to find and operate? Are destructive actions
  separated from common actions?
- Decisions: does the interface ask only what is needed now? Can defaults or
  recorded property facts remove unnecessary choices?
- Memory: are labels, instructions and errors present where needed, without
  requiring users to remember details across screens?
- Attention and grouping: is the primary action clear, and are related labels,
  inputs and feedback visually grouped?
- Familiarity: do navigation, form controls and errors follow familiar patterns
  and ListingBoost's existing design system?
- Progress and endings: are generation and review statuses accurate, and does
  the user know what remains and what happens next?
- Forgiveness: do validation errors explain how to recover while preserving
  entered data? Add tests for input variants when validation changes.

For a design, record relevant cognitive-load decisions and Given/When/Then
acceptance criteria in the spec. For implementation, use existing UI tests and
browser checks where applicable; otherwise record reproducible manual steps in
`verify.md`. For review, record concrete findings in `review.md` with severity
blocker, important or nit. State whether evidence was automated, manual or
visual, and call out any accessibility or research checks that were not covered.

Do not claim progress that has not happened, invent property facts, or use
urgency or consent patterns that mislead users. This repository does not install
the upstream UX-check script or optional UX policy gate.

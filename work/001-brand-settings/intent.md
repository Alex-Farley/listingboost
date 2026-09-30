---
id: "001"
title: "R10 brand settings and templates"
stage: intent
status: approved
source: human          # human | maintain
caused_by: ""          # maintain items: NNN of the change that caused this, if known
owner: ""              # product owner or service owner who approves
created: "2026-09-30"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-09-30T17:57:05Z"
approved_sha256: 69469a7acf1de8158cbbf7d1755455ed3549c03613ce1414ccd382f2f318eb26
---

# Intent: R10 brand settings and templates

## Problem
GitHub issue [#144](https://github.com/Alex-Farley/listingboost/issues/144) and
Master Spec §§21–22 call for each organisation to manage its brand and have that
brand applied to marketing assets. The database already has a `brand_settings`
record and generation uses some brand values, but there is not yet a complete
user-facing workflow for managing the profile and using all supported settings
in new output. In particular, the current fact-only copywriter does not apply
tone of voice (DECISIONS.md D-017). Agency teams therefore cannot reliably keep
new campaign outputs consistent with their branding.

## Users affected
Estate agency owners and team members who configure an organisation's brand or
prepare marketing campaigns. The number of organisations and who within each
organisation should be allowed to edit settings are not established. The
settings workflow must be usable with assistive technology and by users with
access needs.

## Proposed outcome
An organisation can manage its agency identity and branding preferences, and
new generated marketing assets use the applicable saved settings. Changing
brand settings or template preferences does not alter assets that were already
approved.

## In scope
- Organisation-level logo, agency details, contact details, colours,
  typography, tone of voice and preferred templates, as described by issue
  #144 and Master Spec §§21–22.
- Applying the applicable saved branding to new generated copy and graphics,
  while preserving ListingBoost's property-truth rules.
- Preserving existing approved asset versions when brand settings or template
  preferences change.
- Accessible management of these settings in the product.

## Out of scope
- Selecting or integrating a paid image-enhancement or text-generation
  provider, or adding provider credentials. Those remain separate owner
  decisions (OD-1 and OD-2).
- Changing existing approved assets in place.
- Building a general-purpose template authoring platform; issue #144 calls for
  preferred templates, not a template editor.

## Affected systems and teams
- Organisation-scoped `brand_settings` data and its persistence/API boundary.
- The authenticated ListingBoost interface where agency settings are managed.
- New campaign generation of copy and graphics, plus preferred-template
  selection.
- Product owner and engineering for access, branding, and template decisions.

## Constraints
- Every read and write must use the organisation scope from the signed-in
  session; one organisation must not read or change another's settings.
- Do not invent property facts or weaken property-truth validation to achieve a
  desired tone or brand voice.
- Approved assets are immutable versions. Branding changes apply to future
  output; regeneration creates a new version under existing rules.
- No provider credentials are needed or authorised by this issue. The current
  fact-only copywriter is deterministic and does not apply tone of voice; any
  proposed behavior must remain consistent with the open OD-2 decision.
- Follow the existing architecture and accessible design direction in the
  repository docs.

## Success measures
- An organisation member can save and reload the supported brand profile, and
  another organisation cannot read or change it.
- New generated copy and graphics reflect the applicable saved brand settings
  without adding unsupported property claims.
- Changing brand settings or preferred templates leaves previously approved
  asset versions and bytes unchanged.

## Open questions
- Which organisation roles may view and edit brand settings?
- Which logo formats and size limits should be supported, and how should a logo
  be stored and previewed?
- Is the preferred-template setting a choice among the existing templates, and
  what should happen if a preferred template is unavailable for a capability?
- Which fonts and tone-of-voice options or input limits should the product
  support?
- Can the current deterministic copywriter apply tone-of-voice guidance while
  staying fact-only, or does tone application need to wait for a separate
  decision on OD-2? No provider choice is assumed here.
- Which agency details (including office address) should appear in which asset
  types, and what should each output do when a detail is unset?

## Triage (maintain-sourced items only)
<!-- decision: fix-now | schedule | dismiss ; reason: ; decided_by: -->

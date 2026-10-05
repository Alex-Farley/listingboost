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
approved_on: "2026-09-30T20:52:46Z"
approved_sha256: 97e21ef875999f6a6b12e310fbb973d83253311c917f58870695421b93d1c25a
---

# Intent: R10 brand settings and templates

## Problem
GitHub issue [#144](https://github.com/Alex-Farley/listingboost/issues/144) and
Master Spec §§21–22 call for each organisation to manage its brand and use that
brand in marketing assets. The database already has a `brand_settings` record
and generation uses some brand values, but there is not yet a complete
user-facing workflow for managing the profile and applying supported settings
to new output. The current fact-only copywriter does not apply tone of voice
(DECISIONS.md D-017); this work should store the organisation's tone preference
without changing generated copy until that behavior is separately decided.

## Users affected
Estate agency owners and team members who configure an organisation's brand or
prepare marketing campaigns. The number of organisations and who within each
organisation should be allowed to edit settings are not established. The
settings workflow must be usable with assistive technology and by users with
access needs.

## Proposed outcome
An organisation can manage its agency identity and branding preferences, and
new marketing copy and graphics use applicable saved branding and templates.
Campaigns snapshot those settings when created. Tone preference is saved for
future use but is not applied to generated copy in this work. Changing brand
settings or template preferences does not alter assets that were already
approved.

## In scope
- Organisation-level logo, agency details, contact details, colours,
  typography, a stored tone preference and preferred templates, as described
  by issue #144 and Master Spec §§21–22.
- Applying applicable saved brand values and preferred templates to new
  generated copy and graphics while preserving ListingBoost's property-truth
  rules. Each template determines which agency/contact details it displays.
  Tone is stored but not applied to copy.
- Uploading custom fonts in WOFF, WOFF2, TTF or OTF format, with a 2 MiB limit
  per file and confirmation of usage rights on each upload; offering a curated,
  role-grouped bundled font list as a convenience, not a restriction on uploads.
- Allowing organisation owners to edit settings and restore prior logos;
  organisation members can view settings.
- Retaining replaced logo files while the organisation exists.
- Preserving existing approved asset versions when brand settings or template
  preferences change.
- Accessible management of these settings in the product.

## Out of scope
- Applying tone guidance to generated copy or selecting/integrating a paid
  image-enhancement or text-generation provider, or adding provider
  credentials. Those remain separate owner decisions (OD-1 and OD-2).
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
- Campaigns capture brand settings and preferred templates at creation, so
  queued work cannot change branding part-way through a campaign. An unavailable
  preferred template is reported as a limitation; the product does not silently
  substitute another template.
- Each template determines which saved agency/contact fields it displays;
  unset optional details are omitted.
- Logo uploads are limited to 2 MiB, stored in private organisation-scoped R2,
  and accept PNG, JPEG, WebP and SVG after SVG sanitisation. Replaced logos stay
  available for owner restore while the organisation exists.
- A tone preference is a short freeform value stored in the organisation
  profile. It is not sent to or applied by the current copywriter.
- Bundled font presets are grouped by body-text and heading use and selected for
  legibility in property marketing. Every bundled family must have its
  redistribution terms checked and shipped with required notices. Custom font
  uploads remain available independently of the preset list.
- No provider credentials are needed or authorised by this issue. The current
  fact-only copywriter is deterministic and does not apply tone of voice; any
  proposed behavior must remain consistent with the open OD-2 decision.
- Follow the existing architecture and accessible design direction in the
  repository docs.

## Success measures
- An organisation owner can edit, and its members can view, the supported brand
  profile; another organisation cannot read or change it.
- New generated copy and graphics reflect applicable saved branding without
  adding unsupported property claims; stored tone is not applied to copy.
- A campaign uses a consistent snapshot of branding and preferred templates
  from its creation time.
- Changing brand settings or preferred templates leaves previously approved
  asset versions and bytes unchanged.

## Open questions
- The spec should propose and validate a task-suitable initial font preset
  family list and its licensing notices. Custom font upload remains available
  independently of that list.
- The spec should define bounded tone-text validation and the details of the
  supported upload/sanitisation flow without applying tone to generated copy.

## Triage (maintain-sourced items only)
<!-- decision: fix-now | schedule | dismiss ; reason: ; decided_by: -->

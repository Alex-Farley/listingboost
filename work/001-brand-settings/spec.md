---
id: "001"
stage: spec
status: draft
intent: intent.md
policies_applied: []
---

# Spec: R10 brand settings and templates

## Summary

Give each organisation an accessible way to manage its brand profile and
preferences for existing templates. Use saved branding in new marketing output
without weakening property-truth checks or changing previously approved
assets. The intent is approved; several product choices below need owner
resolution before this spec can be approved.

## Requirements

| ID | Requirement | Serves (intent section) |
|----|-------------|-------------------------|
| R1 | An authenticated user authorized under the approved organisation-role policy can read and update their own organisation's brand settings only. | Users affected; Constraints |
| R2 | The brand profile supports agency identity and contact details, logo, colours, typography, tone of voice, and preferred templates. | In scope |
| R3 | Settings have explicit validation and recoverable save errors; invalid input is not persisted. | Proposed outcome; Constraints |
| R4 | New generated copy and graphics use the applicable saved brand values and keep property claims grounded in recorded facts. | Proposed outcome; In scope; Constraints |
| R5 | Preferred templates affect new campaigns only; each generated asset retains the template version used to create it. | Proposed outcome; In scope |
| R6 | Changing brand settings or template preferences never mutates an already approved asset version or its bytes. | Proposed outcome; In scope |
| R7 | The settings journey is understandable and operable with keyboard and assistive technology, and on narrow screens. | Users affected; In scope |

## User journeys

1. An authenticated organisation member opens **Brand Settings** from the
   application navigation. The page loads that organisation's current values
   (or clearly indicates which values are unset).
2. The user edits supported agency details, logo, visual settings, tone and
   preferred templates. Validation errors identify the field and how to fix it;
   a failed save preserves the user's entries. A successful save confirms that
   the values are stored.
3. The user creates a campaign after saving preferences. Newly generated copy
   and graphics use the applicable saved values and selected templates. If a
   value or capability is unavailable, the product reports that honestly and
   uses only a fallback the product owner has approved.
4. The user changes a preference after an earlier asset was approved. The
   earlier version remains byte-for-byte unchanged; any new generation creates
   a separate version under the existing versioning and approval rules.

## Design decisions

| Decision | Alternatives considered | Why this one | Decision record |
|----------|-------------------------|--------------|-----------------|
| Keep brand settings organisation-scoped, using the existing `brand_settings` record as the source of truth. | Per-user settings; copy settings onto each property. | Issue #144 and the existing architecture define one brand per organisation. | Existing architecture; no new decision record proposed. |
| Apply changed preferences to future campaigns only; keep the selected template version on each campaign asset. | Retroactively update existing campaign assets. | Approved output is immutable, and issue #144 explicitly says template changes must not alter previously approved assets. | Existing versioning rule; no new decision record proposed. |
| Do not select or add a paid generation provider as part of this work. | Add an external text or image provider to enable more branding behavior. | Provider selection and credentials are outside the intent and remain owner decisions OD-1/OD-2. | `docs/DECISIONS.md` OD-1/OD-2. |

## Cognitive load (only if users see or do anything different; see sdlc-ux-review)

| Theme / law | Decision | Alternative rejected |
|-------------|----------|----------------------|
| Effort | Provide one organisation-level settings destination rather than asking users to repeat brand details for every property or campaign. | Re-entering the same agency details per campaign. |
| Decisions | Present only supported values and available templates; explain unset values and any approved fallback. | Exposing raw template configuration or silently choosing an unavailable option. |
| Memory | Show saved values when the user returns and group fields by identity, contact, visual style, tone, and templates. | Requiring users to remember prior values or how generated output is configured. |
| Attention and grouping | Use the existing form patterns and clear Save action; associate labels, help and errors with fields. | A single unstructured list of settings. |
| Familiarity | Follow the ListingBoost design system and normal form controls. | Introducing a separate settings interaction model. |
| Progress and endings | Show loading, save success, and recoverable failure states; do not claim generation changed until new output uses the saved settings. | A silent save or misleading generation status. |
| Forgiveness | Preserve entered values after validation or network failure and allow correction without starting over. | Clearing the form on failure. |

## Data

| Data item | Personal? | Classification | Stored where | Retention | Shared with |
|-----------|-----------|----------------|--------------|-----------|-------------|
| Agency name, office/address and contact details | Possibly: a named person's direct contact details may identify an individual. | Confidential organisation profile; contact values may be personal data. | Existing organisation-scoped `brand_settings` row in D1. | While the organisation profile exists; deletion/retention behavior needs confirmation for any new logo object. | Authenticated members of that organisation; server-side generation adapters for relevant outputs. No cross-organisation access. |
| Logo | May identify an agency or person. | Confidential business asset; treat as potentially personal. | Private media storage is the proposed location; accepted upload/storage behavior is unresolved. | While in use by the organisation, subject to confirmed deletion behavior. | Server-side renderer when producing relevant assets; resulting approved output is available to that organisation. |
| Colours, typography, tone and preferred-template settings | Normally no, but free-text tone guidance could contain personal data. | Confidential organisation configuration. | Existing `brand_settings` row in D1. | While the organisation profile exists; exact account deletion policy follows product policy. | Server-side copy/graphics generation for relevant outputs; authenticated members of that organisation. |

Do not log complete contact values, free-text tone guidance, or logo bytes.
No external provider transfer is introduced by this spec. Any later provider
that receives these values requires a separate approved provider decision.

## Acceptance criteria

| ID | Requirement | Given | When | Then |
|----|-------------|-------|------|------|
| AC1 | R1 | A signed-in, authorized member of organisation A requests the settings page/API. | The settings are loaded. | Only organisation A's settings are returned; unset fields are represented consistently. |
| AC2 | R1 | A signed-in, authorized member of organisation A submits valid settings. | The settings are saved. | A subsequent read by organisation A returns the saved values. |
| AC3 | R1 | A user from organisation B knows an organisation A settings URL or identifier. | The user attempts to read or update A's settings. | The request returns the standard not-found response and changes no data. |
| AC4 | R2 | The settings form is opened for an organisation without optional values set. | The user views the page. | Unset values are clear and are not presented as configured facts. |
| AC5 | R3 | A submitted field has an invalid value under the approved validation rules. | The user saves. | The field receives a useful validation error and no invalid settings are persisted. |
| AC6 | R3 | A valid edit is submitted but persistence fails. | The save request fails. | The user sees a recoverable error and their entered values remain available. |
| AC7 | R2/R4 | A supported logo has been saved. | A new supported graphic is generated. | The graphic uses that logo; if no logo is configured, the approved fallback is used and no broken image is shown. |
| AC8 | R4 | Brand colours, typography and agency identity are configured. | A new supported graphic is generated. | The applicable saved values appear in the output; unset values use the approved defaults. |
| AC9 | R4 | Copy generation receives configured tone and contact details. | A new copy asset is generated. | The approved tone behavior and applicable contact details are used, and no unsupported property claim is added. |
| AC10 | R5 | A preferred template is configured for a supported asset type. | A new campaign is created. | The campaign selects that preference and records the chosen template ID and version. |
| AC11 | R5 | A preferred template is unavailable or unsupported for the requested capability. | A new campaign is created. | The product does not silently claim that preference was used; it follows the owner-approved fallback or reports the limitation. |
| AC12 | R6 | An asset version has been approved. | Brand settings or preferred templates change. | The approved version's stored output and bytes remain unchanged. |
| AC13 | R6 | A campaign asset is regenerated after brand settings change. | Generation completes. | A new version is created; the earlier approved version remains intact and final-version rules are respected. |
| AC14 | R7 | A keyboard or assistive-technology user edits a setting with invalid input. | They navigate, submit and correct the form. | Controls have programmatic labels, errors are associated with fields, focus remains usable, and entered values are preserved. |
| AC15 | R7 | The settings page is used at desktop and narrow mobile widths. | The user views and saves the form. | All fields, errors and the primary action remain visible and operable without horizontal page scrolling. |

AC7–AC11 depend on decisions in **Flagged concerns**. They are not ready for
implementation until the relevant behavior and fallback are approved.

## Service levels (if this adds or changes a user journey that matters)

No new SLO is proposed for editing organisation settings. The journey uses the
existing authenticated application and generation services; it must retain
their existing error handling and honest capability reporting.

## Flagged concerns

| Policy | Conflict | Options | Owner | Resolution |
|--------|----------|---------|-------|------------|
| Product decision / OD-2 | The current deterministic copywriter does not apply tone of voice, but issue #144 requires branding to flow into generated output. | Define a bounded deterministic tone vocabulary that cannot alter facts; or defer tone application until a separately approved text-provider decision. Do not add credentials here. | Product owner | Unresolved; decide before approving this spec. |
| Product decision | The issue asks for preferred templates but does not define how preferences map to asset types or campaigns. Existing campaign planning selects fixed built-in templates. | Choose among the existing templates per supported asset type for future campaigns; or limit this work to recording preferences until a later selection flow. Define behavior when unavailable. | Product owner | Unresolved; choose the product behavior and fallback. |
| Product / access policy | The intent does not specify which organisation roles may view or edit the profile. | Allow all members to edit; or restrict edits to a defined role while other members can view. | Product owner | Unresolved; choose access rules. |
| Data handling | Logo formats, size limits, private storage and deletion behavior are not specified. | Reuse a validated private media flow with a dedicated logo policy; or support a smaller explicit set of formats and limits. | Product owner with engineering | Unresolved; choose supported formats, limits and lifecycle before implementation. |
| Product / UX | The issue does not say which agency/contact details appear on each asset type, or whether office address is included. | Map each field to named output types; omit unset optional details. | Product owner | Unresolved; approve field-to-output mapping and unset behavior. |
| Product / design system | Typography choices and tone input limits are unspecified; arbitrary font strings may not map to bundled fonts. | Use an allowlist of bundled fonts and bounded tone choices/text; or retain current defaults for unsupported values. | Product owner with design | Unresolved; confirm available fonts, tone controls and limits. |
| Data handling | Business contact details and free-text tone guidance may contain personal data. | Treat contact/free-text values as potentially personal, minimize logs and keep them organisation-scoped; confirm retention and deletion policy. | Product owner / privacy owner | Unresolved; confirm retention/deletion expectations. |

No `policy-*` skills are installed in this repository. The repository's
architecture, tenancy and property-truth rules have been applied above.

## Open questions

- Should campaign generation snapshot branding when the campaign is created,
  when a job begins, or read the latest saved profile at each generation? The
  choice affects consistent output for jobs that wait in the queue.
- Does “preferred templates” mean one default per asset type, a set of options
  users choose during campaign creation, or both?
- Which template capabilities should consume a logo, contact detail or tone
  setting? The current renderer uses agency name and primary colour, while the
  current template renderer bundles fixed fonts and does not render the logo.
